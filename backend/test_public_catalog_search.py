"""Search term extraction for public catalog (Nickname + multilingual names)."""

from types import SimpleNamespace

from services.public_catalog_logic import _build_search_terms


def test_build_search_terms_includes_nickname_and_all_lang_names():
    detail = {
        "SKU": "FR0208A44701",
        "Nickname": "Panci Emas",
        "ID_Name": "Panci Anti Lengket",
        "EN_Name": "Non-stick Pan",
        "ZH_Name": "不粘锅",
    }
    row = SimpleNamespace(product_name="Legacy Name")
    terms = _build_search_terms(detail, "FR0208A44701", row)
    assert "Panci Emas" in terms
    assert "Non-stick Pan" in terms
    assert "不粘锅" in terms
    assert "FR0208A44701" in terms


def test_build_search_terms_deduplicates_case_insensitive():
    detail = {
        "Nickname": "freemir pan",
        "EN_Name": "Freemir Pan",
    }
    terms = _build_search_terms(detail, "SKU1", None)
    lowered = [t.casefold() for t in terms]
    assert lowered.count("freemir pan") == 1


def test_build_search_terms_picks_nickname_variant_columns():
    detail = {
        "ID_Nickname": "Kuali Keren",
        "EN_Nickname": "Cool Wok",
    }
    terms = _build_search_terms(detail, "SKU2", None)
    assert "Kuali Keren" in terms
    assert "Cool Wok" in terms
