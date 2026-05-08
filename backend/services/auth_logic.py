import gspread
import os
import re
import json
import hashlib
import json
import jwt
import datetime
import traceback
import time
import threading
import secrets
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Tuple, List
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ActivityLog, AccountUser

# Same spreadsheet as price checker
SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1aS1wpEJ5jIYFYYsZT1U4-gabyb5XwGn4u1-OpRhiucc"

if os.path.exists("/etc/secrets/credentials.json"):
    CREDENTIALS_FILE = "/etc/secrets/credentials.json"
else:
    CREDENTIALS_FILE = "credentials.json"

# Secret key for JWT tokens (in prod should come from env var)
JWT_SECRET = os.environ.get("JWT_SECRET", "freemir_tools_2026_secret_key_change_in_prod")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# SMTP configuration for password reset emails
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))

# Tool keys matching Google Sheets column names for per-user access control
TOOL_KEYS = [
    "price_checker", "order_planner", "order_review",
    "affiliate_performance", "pre_sales", "affiliate_analyzer", "ads_analyzer",
    "admin", "product_performance", "livestream_display", "photo_downloader"
]

# TIMEOUT PROTECTION for Google Sheets API
SHEETS_API_TIMEOUT = 20  # 20 seconds timeout for Google Sheets calls

def call_with_timeout(func, timeout_sec=SHEETS_API_TIMEOUT):
    """
    Execute a function with a timeout. Returns (success, result).
    If timeout, returns (False, "Google Sheets API timeout").
    """
    result = [None]
    error = [None]
    
    def wrapper():
        try:
            result[0] = func()
        except Exception as e:
            error[0] = e
    
    thread = threading.Thread(target=wrapper, daemon=True)
    thread.start()
    thread.join(timeout=timeout_sec)
    
    if thread.is_alive():
        # Thread still running = timeout
        return False, f"Google Sheets API timeout (>{timeout_sec}s). Using cached data or minimal default."
    
    if error[0]:
        return False, f"Google Sheets API error: {str(error[0])}"
    
    return True, result[0]

# === CACHING LAYER ===
_cached_client = None
_cached_sh = None
_cached_users_timestamp = 0
_cached_users = []
CACHE_DURATION = 300  # Cache Google Sheets data for 5 minutes

def normalize_permissions(raw_permissions) -> Dict:
    """Normalize permissions value to a dict, handling legacy JSON-string rows."""
    if isinstance(raw_permissions, dict):
        return raw_permissions
    if isinstance(raw_permissions, str):
        text = raw_permissions.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def is_permission_enabled(value) -> bool:
    """Normalize truthy permission flags across int/bool/string formats."""
    if value in (1, True):
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return False


def has_permission(raw_permissions, key: str) -> bool:
    perms = normalize_permissions(raw_permissions)
    if is_permission_enabled(perms.get("admin")):
        return True
    return is_permission_enabled(perms.get(key))

def get_sheet_client():
    global _cached_client, _cached_sh
    if _cached_sh is None:
        if _cached_client is None:
            _cached_client = gspread.service_account(filename=CREDENTIALS_FILE)
        _cached_sh = _cached_client.open_by_url(SPREADSHEET_URL)
    return _cached_sh


def hash_password(password: str) -> str:
    """Simple SHA-256 hash for password storage."""
    return hashlib.sha256(password.encode()).hexdigest()


def get_users() -> List[Dict]:
    """
    Fetch all users from Account sheet with caching and TIMEOUT protection.
    Cache expires after CACHE_DURATION seconds.
    Returns cached data if API times out.
    """
    global _cached_users, _cached_users_timestamp
    
    now = time.time()
    # Return cached data if still valid
    if _cached_users and (now - _cached_users_timestamp) < CACHE_DURATION:
        return _cached_users
    
    # Attempt to fetch fresh data with timeout
    def fetch_from_sheet():
        sh = get_sheet_client()
        ws = sh.worksheet("Account")
        rows = ws.get_all_values()
        if not rows:
            return []

        headers_raw = rows[0]
        headers = []
        seen = set()
        for idx, h in enumerate(headers_raw):
            key = str(h).strip() if h is not None else ""
            if not key:
                key = f"col_{idx + 1}"
            # Ensure header keys are unique so dict mapping stays stable.
            if key in seen:
                suffix = 2
                while f"{key}_{suffix}" in seen:
                    suffix += 1
                key = f"{key}_{suffix}"
            headers.append(key)
            seen.add(key)

        result = []
        for raw in rows[1:]:
            row = list(raw) + [""] * (len(headers) - len(raw))
            item = {headers[i]: row[i] for i in range(len(headers))}
            if any(str(v).strip() for v in item.values()):
                result.append(item)
        return result
    
    success, result = call_with_timeout(fetch_from_sheet, timeout_sec=SHEETS_API_TIMEOUT)
    
    if success:
        # Update cache
        _cached_users = result
        _cached_users_timestamp = now
        print(f"[Auth] ✓ Updated user cache from Google Sheets ({len(result)} users)")
        return result
    else:
        # Timeout or error
        print(f"[Auth] {result}")
        if _cached_users:
            print(f"[Auth] ⚠ Using stale cache ({len(_cached_users)} users)")
            return _cached_users
        # No cache available
        raise RuntimeError(f"Cannot fetch users: {result}")


def sync_users_from_sheet() -> Tuple[bool, str]:
    """
    Sync users from Google Sheet to PostgreSQL dengan incremental update (lebih cepat).
    - Hanya update/insert yang berubah
    - Hanya delete users yang sudah tidak ada di sheet
    - WITH TIMEOUT PROTECTION (max 15 seconds)
    """
    def do_sync():
        users = get_users()
        db = SessionLocal()
        try:
            max_id = db.query(AccountUser.id).order_by(AccountUser.id.desc()).first()
            next_id = (max_id[0] + 1) if max_id and max_id[0] is not None else 1

            # Get usernames dari sheet
            sheet_usernames = {
                str(user.get("Username", "")).strip()
                for user in users
                if str(user.get("Username", "")).strip()
            }
            
            # Get existing usernames dari DB
            existing_users = db.query(AccountUser.username).all()
            existing_usernames = {str(u.username).strip() for u in existing_users if u.username and str(u.username).strip()}
            
            # Delete users yang tidak ada di sheet anymore
            to_delete = existing_usernames - sheet_usernames
            if to_delete:
                db.query(AccountUser).filter(AccountUser.username.in_(to_delete)).delete()
            
            # Insert/Update users dari sheet
            for user in users:
                username = str(user.get("Username", "")).strip()
                if not username:
                    continue
                    
                # Parse permissions
                perms = {}
                for tk in TOOL_KEYS:
                    val = str(user.get(tk, "0")).strip()
                    perms[tk] = 1 if val == "1" else 0
                
                # Check if user exists
                existing = db.query(AccountUser).filter(
                    AccountUser.username.ilike(username)
                ).first()
                
                if existing:
                    # Update existing user (email, password, approval, permissions from sheet).
                    # Do NOT overwrite `name`: admin-assigned display names are edited in Access Management
                    # and stored in PostgreSQL; sheet sync should not revert them.
                    existing.email = str(user.get("Email", "")).strip()
                    existing.password = str(user.get("Password", "")).strip()
                    existing.approval = str(user.get("Approval", "")).strip()
                    existing.permissions = perms
                else:
                    # Insert new user
                    sheet_name = str(user.get("Name", "")).strip()
                    new_user = AccountUser(
                        id=next_id,
                        email=str(user.get("Email", "")).strip(),
                        username=username,
                        name=sheet_name or username,
                        password=str(user.get("Password", "")).strip(),
                        approval=str(user.get("Approval", "")).strip(),
                        permissions=perms
                    )
                    db.add(new_user)
                    next_id += 1
            
            db.commit()
            
            # Clear cache setelah sync
            global _cached_users_timestamp
            _cached_users_timestamp = 0
            
            return f"✓ Users synced successfully. ({len(sheet_usernames)} in sheet, {len(to_delete)} deleted)"
        finally:
            db.close()
    
    # Execute with timeout
    success, result = call_with_timeout(do_sync, timeout_sec=45)
    
    if success:
        return True, result
    else:
        # Timeout or error - still return meaningful error
        return False, result

def find_user_by_username(username: str) -> Optional[Dict]:
    """Find a user by username from the database (case-insensitive)."""
    db = SessionLocal()
    try:
        user = db.query(AccountUser).filter(
            AccountUser.username.ilike(username.strip().lower())
        ).first()
        
        if user:
            return {
                "Email": user.email,
                "Username": user.username,
                "Name": user.name or user.username,
                "Password": user.password,
                "Approval": user.approval,
                "permissions": normalize_permissions(user.permissions)
            }
        return None
    finally:
        db.close()


def find_user_by_email(email: str) -> Optional[Dict]:
    """Find a user by email from the database (case-insensitive)."""
    db = SessionLocal()
    try:
        user = db.query(AccountUser).filter(
            AccountUser.email.ilike(email.strip().lower())
        ).first()
        
        if user:
            return {
                "Email": user.email,
                "Username": user.username,
                "Name": user.name or user.username,
                "Password": user.password,
                "Approval": user.approval,
                "permissions": normalize_permissions(user.permissions)
            }
        return None
    finally:
        db.close()


def login_user_optimized(username: str, password: str) -> Tuple[bool, str, Optional[str]]:
    """
    Optimized login dengan single DB query.
    """
    try:
        db = SessionLocal()
        try:
            # Single query untuk find user
            user = db.query(AccountUser).filter(
                AccountUser.username.ilike(username.strip().lower())
            ).first()
            
            if not user:
                return False, "Username not found.", None
            
            # Check password
            hashed = hash_password(password)
            if hashed != user.password.strip():
                return False, "Incorrect password.", None
            
            # Check approval status
            approval = str(user.approval).strip().lower()
            if approval == "waiting":
                return False, "Your account is pending admin approval.", None
            if approval != "approve":
                return False, "Your account has been rejected or is inactive.", None
            
            # Generate JWT
            permissions = normalize_permissions(user.permissions)
            payload = {
                "username": user.username,
                "name": user.name or user.username,
                "email": user.email or "",
                "permissions": permissions,
                "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRE_HOURS),
                "iat": datetime.datetime.utcnow(),
            }
            token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
            return True, "Login successful.", token
        finally:
            db.close()
    except Exception as e:
        print(f"[Login Error] {e}")
        return False, f"Login error: {str(e)}", None


def signup_user(email: str, username: str, password: str) -> Tuple[bool, str]:
    """Register a new user with Waiting status."""
    try:
        # Check duplicates (DB queries — fast)
        if find_user_by_email(email):
            return False, "Email already registered."
        if find_user_by_username(username):
            return False, "Username already taken."

        hashed = hash_password(password)

        # Write to Google Sheets WITH timeout protection
        def write_to_sheet():
            sh = get_sheet_client()
            ws = sh.worksheet("Account")
            ws.append_row([email, username, hashed, "Waiting"])

        success, result = call_with_timeout(write_to_sheet, timeout_sec=SHEETS_API_TIMEOUT)
        if not success:
            return False, f"Registration failed: Google Sheets unavailable ({result}). Please try again."

        return True, "Registration successful. Please wait for admin approval."

    except Exception as e:
        return False, f"Registration failed: {str(e)}"



def login_user(username: str, password: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validate login.
    Returns (success, message, jwt_token)
    """
    try:
        user = find_user_by_username(username)
        if not user:
            return False, "Username not found.", None

        # Check password
        hashed = hash_password(password)
        stored_hash = str(user.get("Password", "")).strip()
        if hashed != stored_hash:
            return False, "Incorrect password.", None

        # Check approval status
        approval = str(user.get("Approval", "")).strip().lower()
        if approval == "waiting":
            return False, "Your account is pending admin approval.", None
        if approval != "approve":
            return False, "Your account has been rejected or is inactive.", None

        # Generate JWT
        permissions = normalize_permissions(user.get("permissions", {}))
        payload = {
            "username": user["Username"],
            "name": user.get("Name") or user["Username"],
            "email": user.get("Email", ""),
            "permissions": permissions,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRE_HOURS),
            "iat": datetime.datetime.utcnow(),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return True, "Login successful.", token

    except Exception as e:
        return False, f"Login error: {str(e)}", None


def verify_token(token: str) -> Optional[Dict]:
    """Verify JWT and return payload if valid."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_auth_claims_from_db(username: str) -> Optional[Dict]:
    """
    Current display name, email, and permissions for a user (canonical casing from DB).
    Used after JWT validation so the UI shows admin-maintained name, not only claims
    frozen at login time.
    """
    if not username or not str(username).strip():
        return None
    db = SessionLocal()
    try:
        user = db.query(AccountUser).filter(
            AccountUser.username.ilike(username.strip().lower())
        ).first()
        if not user:
            return None
        return {
            "username": user.username,
            "name": user.name or user.username,
            "email": user.email or "",
            "permissions": normalize_permissions(user.permissions),
        }
    finally:
        db.close()


def log_activity(username: str, tool_name: str, ip_address: str = ""):
    """Store user activity log in PostgreSQL and DingTalk."""
    try:
        db = SessionLocal()
        
        jakarta_tz = datetime.timezone(datetime.timedelta(hours=7))
        # Get raw Jakarta time, then strip timezone details and microseconds so PostgreSQL stores the literal numbers safely.
        now_dt = datetime.datetime.now(jakarta_tz).replace(tzinfo=None, microsecond=0)
        tool_general = re.sub(r"\s*\([^)]*\)\s*", " ", tool_name or "").strip()
        tool_general = re.sub(r"\s+", " ", tool_general)
        
        new_log = ActivityLog(
            time=now_dt,
            username=username,
            tools=tool_name,
            tools_general=tool_general or tool_name,
        )
        db.add(new_log)
        db.commit()
        db.close()
        
        time_str = now_dt.strftime('%Y-%m-%d %H:%M:%S')
        print(f"[Activity Log] ✓ Logged to DB: {username} used {tool_name} at {time_str}")
        
        # Kirim notifikasi ke DingTalk
        from services.dingtalk_service import send_activity_log
        send_activity_log(username, tool_name, time_str)

    except Exception as e:
        print(f"[Activity Log DB Error] {e}")
        traceback.print_exc()


# ── PASSWORD RESET ────────────────────────────────────────────────────────────

def _generate_temp_password(length: int = 10) -> str:
    """Generate a random alphanumeric password."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in pwd) and any(c.isalpha() for c in pwd):
            return pwd


def _send_reset_email(to_email: str, username: str, new_password: str) -> bool:
    """Send password reset email via SMTP."""
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        print("[Email] SMTP credentials not configured (SMTP_EMAIL / SMTP_APP_PASSWORD env vars missing)")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Freemir — Password Reset"
        msg["From"] = f"Freemir Ops <{SMTP_EMAIL}>"
        msg["To"] = to_email

        html_body = f"""
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
          <h2 style="color:#1e293b;margin:0 0 8px;">Password Reset</h2>
          <p style="color:#64748b;margin:0 0 24px;">
            Hi <strong>{username}</strong>, your password for the Freemir Internal Operations Platform has been reset.
          </p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:24px;">
            <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">New Password</div>
            <code style="font-size:24px;font-weight:700;letter-spacing:4px;color:#4f46e5;">{new_password}</code>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:0;">
            Log in with this password. You may ask your admin to change it if needed.
          </p>
        </div>
        """
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            smtp.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        print(f"[Email] ✓ Password reset email sent to {to_email}")
        return True
    except Exception as e:
        print(f"[Email] ✗ Failed to send to {to_email}: {e}")
        return False


def reset_password(username: str, email: str) -> Tuple[bool, str]:
    """
    Reset password if username + email both match a record in the DB.
    Generates a new random password, updates DB + Google Sheets, sends email.
    """
    try:
        db = SessionLocal()
        try:
            user = db.query(AccountUser).filter(
                AccountUser.username.ilike(username.strip())
            ).first()

            if not user:
                return False, "Username not found."

            if user.email.strip().lower() != email.strip().lower():
                return False, "Email does not match our records."

            # Generate + hash new password
            new_pwd = _generate_temp_password()
            hashed = hash_password(new_pwd)

            # Update DB
            user.password = hashed
            db.commit()

            # Update Google Sheets (best-effort, don't fail if timeout)
            def _update_sheet():
                sh = get_sheet_client()
                ws = sh.worksheet("Account")
                headers = ws.row_values(1)
                if "Password" not in headers or "Username" not in headers:
                    return
                pwd_col = headers.index("Password") + 1
                uname_col = headers.index("Username") + 1
                all_usernames = ws.col_values(uname_col)
                for i, uname in enumerate(all_usernames):
                    if uname.strip().lower() == username.strip().lower():
                        ws.update_cell(i + 1, pwd_col, hashed)
                        break

            call_with_timeout(_update_sheet, timeout_sec=SHEETS_API_TIMEOUT)

            # Send email
            email_sent = _send_reset_email(user.email, user.username, new_pwd)
            if email_sent:
                return True, "Password reset successful. Check your email for the new password."
            else:
                return False, "Password was reset but the email could not be sent. Please contact your admin."

        finally:
            db.close()

    except Exception as e:
        print(f"[Reset Password] Error: {e}")
        traceback.print_exc()
        return False, f"Reset failed: {str(e)}"


def change_password(username: str, current_password: str, new_password: str) -> Tuple[bool, str]:
    """
    Change password for a logged-in user.
    Verifies current password first, then updates to new hashed password in DB + Sheets.
    """
    try:
        db = SessionLocal()
        try:
            user = db.query(AccountUser).filter(
                AccountUser.username.ilike(username.strip())
            ).first()

            if not user:
                return False, "User not found."

            # Verify current password
            if hash_password(current_password) != user.password.strip():
                return False, "Current password is incorrect."

            if len(new_password) < 6:
                return False, "New password must be at least 6 characters."

            hashed_new = hash_password(new_password)

            # Update DB
            user.password = hashed_new
            db.commit()

            # Update Google Sheets (best-effort)
            def _update_sheet():
                sh = get_sheet_client()
                ws = sh.worksheet("Account")
                headers = ws.row_values(1)
                if "Password" not in headers or "Username" not in headers:
                    return
                pwd_col = headers.index("Password") + 1
                uname_col = headers.index("Username") + 1
                all_usernames = ws.col_values(uname_col)
                for i, uname in enumerate(all_usernames):
                    if uname.strip().lower() == username.strip().lower():
                        ws.update_cell(i + 1, pwd_col, hashed_new)
                        break

            call_with_timeout(_update_sheet, timeout_sec=SHEETS_API_TIMEOUT)

            return True, "Password changed successfully."

        finally:
            db.close()

    except Exception as e:
        print(f"[Change Password] Error: {e}")
        traceback.print_exc()
        return False, f"Change failed: {str(e)}"

