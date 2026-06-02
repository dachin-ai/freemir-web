import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ConfigProvider, theme, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import idID from 'antd/locale/id_ID';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LangProvider, useLang } from './context/LangContext';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import LearnProductsPage from './pages/LearnProductsPage';
import CompareProductsPage from './pages/CompareProductsPage';
import PriceChecker from './pages/PriceChecker';
import Dashboard from './pages/Dashboard';
import OrderLossReview from './pages/OrderLossReview';
import FailedDelivery from './pages/FailedDelivery';
import PreSalesEstimation from './pages/PreSalesEstimation';
import ErpOosCalculate from './pages/ErpOosCalculate';
import SkuMonthlyPlan from './pages/SkuMonthlyPlan';
import ConversionCleaner from './pages/ConversionCleaner';
import OrderMatchChecker from './pages/OrderMatchChecker';
import WarehouseOrder from './pages/WarehouseOrder';
import SocmedScraping from './pages/SocmedScraping';
import AffiliateAnalyzer from './pages/AffiliateAnalyzer';
import ShopeeAffiliate from './pages/ShopeeAffiliate';
import TikTokAds from './pages/TikTokAds';
import RequestAccess from './pages/RequestAccess';
import AccessManagement from './pages/AccessManagement';
import ProductPerformanceCleaner from './pages/ProductPerformanceCleaner';
import LivestreamDisplay from './pages/LivestreamDisplay';
import PhotoDownloader from './pages/PhotoDownloader';
import BrandMaterial from './pages/BrandMaterial';
import QuickLinks from './pages/QuickLinks';
import SkuReviewAnalysis from './pages/SkuReviewAnalysis';
import PermissionGate from './components/PermissionGate';
import { useTranslation } from 'react-i18next';
import { LEGACY_TOOL_REDIRECTS, PATH_HOME, PATH_LOGIN, PATH_TOOLS } from './routes/paths';

const antdLocales = { en: enUS, zh: zhCN, id: idID };

function LegacyBrandMaterialSkuRedirect() {
  const { sku } = useParams();
  return <Navigate to={`${PATH_TOOLS}/brand-material/${encodeURIComponent(sku || '')}`} replace />;
}

// Protected route wrapper
function ProtectedApp() {
  const { user, loading } = useAuth();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: isDark ? '#020617' : '#f0f9ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16
      }}>
        <Spin size="large" />
        <div style={{ color: '#64748b', fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
          {t('common.verifyingSession')}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path={PATH_HOME} element={<LandingPage />} />
        <Route path="/learn-products" element={<LearnProductsPage />} />
        <Route path="/compare-products" element={<CompareProductsPage />} />
        <Route path={PATH_LOGIN} element={<LoginPage />} />
        <Route
          path={`${PATH_TOOLS}/*`}
          element={<Navigate to={PATH_LOGIN} replace state={{ from: location.pathname }} />}
        />
        <Route path="*" element={<Navigate to={PATH_HOME} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path={PATH_HOME} element={<LandingPage />} />
      <Route path="/learn-products" element={<LearnProductsPage />} />
      <Route path="/compare-products" element={<CompareProductsPage />} />
      <Route path={PATH_LOGIN} element={<Navigate to={PATH_TOOLS} replace />} />
      {LEGACY_TOOL_REDIRECTS.map((segment) => (
        <Route
          key={segment}
          path={`/${segment}`}
          element={<Navigate to={`${PATH_TOOLS}/${segment}`} replace />}
        />
      ))}
      <Route path="/brand-material/:sku" element={<LegacyBrandMaterialSkuRedirect />} />
      <Route path={PATH_TOOLS} element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="price-checker" element={<PermissionGate toolKey="price_checker"><PriceChecker /></PermissionGate>} />
        <Route path="order-loss" element={<PermissionGate toolKey="order_review"><OrderLossReview /></PermissionGate>} />
        <Route path="failed-delivery" element={<FailedDelivery />} />
        <Route path="pre-sales" element={<PermissionGate toolKey="pre_sales"><PreSalesEstimation /></PermissionGate>} />
        <Route path="erp-oos" element={<ErpOosCalculate />} />
        <Route path="sku-plan" element={<SkuMonthlyPlan />} />
        <Route path="conversion-cleaner" element={<ConversionCleaner />} />
        <Route path="order-match" element={<OrderMatchChecker />} />
        <Route path="warehouse-order" element={<PermissionGate toolKey="order_planner"><WarehouseOrder /></PermissionGate>} />
        <Route path="socmed-scraping" element={<SocmedScraping />} />
        <Route path="affiliate-analyzer" element={<PermissionGate toolKey="affiliate_analyzer"><AffiliateAnalyzer /></PermissionGate>} />
        <Route path="shopee-affiliate" element={<PermissionGate toolKey="affiliate_performance"><ShopeeAffiliate /></PermissionGate>} />
        <Route path="tiktok-ads" element={<PermissionGate toolKey="ads_analyzer"><TikTokAds /></PermissionGate>} />
        <Route path="request-access" element={<RequestAccess />} />
        <Route path="quick-links" element={<QuickLinks />} />
        <Route path="access-management" element={<PermissionGate toolKey="admin"><AccessManagement /></PermissionGate>} />
        <Route path="product-performance" element={<PermissionGate toolKey="product_performance"><ProductPerformanceCleaner /></PermissionGate>} />
        <Route path="livestream-display" element={<PermissionGate toolKey="livestream_display"><LivestreamDisplay /></PermissionGate>} />
        <Route path="photo-downloader" element={<PermissionGate toolKey="photo_downloader"><PhotoDownloader /></PermissionGate>} />
        <Route path="sku-review" element={<SkuReviewAnalysis />} />
        <Route path="brand-material">
          <Route index element={<PermissionGate toolKey="brand_material"><BrandMaterial /></PermissionGate>} />
          <Route path=":sku" element={<PermissionGate toolKey="brand_material"><BrandMaterial /></PermissionGate>} />
        </Route>
        <Route path="*" element={<Navigate to={PATH_TOOLS} replace />} />
      </Route>
      <Route path="*" element={<Navigate to={PATH_HOME} replace />} />
    </Routes>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const { lang } = useLang();

  return (
    <ConfigProvider
      locale={antdLocales[lang] || zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#38bdf8' : '#0ea5e9', /* = --fm-blue per theme */
          colorBgBase:       isDark ? '#0f172a'              : '#f0f9ff',
          colorBgContainer:  isDark ? 'rgba(30,41,59,0.6)'   : '#ffffff',
          colorBgElevated:   isDark ? 'rgba(30,41,59,0.8)'   : '#ffffff',
          colorBorder:       isDark ? 'rgba(255,255,255,0.1)' : 'rgba(2, 132, 199, 0.14)',
          fontFamily: "'Inter', sans-serif",
          borderRadius: 12,
        },
      }}
    >
      <Router>
        <AuthProvider>
          <ProtectedApp />
        </AuthProvider>
      </Router>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AppContent />
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;
