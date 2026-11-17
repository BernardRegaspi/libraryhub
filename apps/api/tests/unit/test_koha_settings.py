from app.core.config import get_settings


def test_koha_settings_read_oauth_timeout_and_opac(monkeypatch):
    monkeypatch.setenv("KOHA_BASE_URL", "http://koha.test")
    monkeypatch.setenv("KOHA_CLIENT_ID", "cid")
    monkeypatch.setenv("KOHA_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("KOHA_OPAC_URL", "http://opac.test/")
    monkeypatch.setenv("KOHA_API_TIMEOUT", "9")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.koha_base_url == "http://koha.test"
    assert settings.koha_client_id == "cid"
    assert settings.koha_client_secret == "csecret"
    assert settings.koha_opac_url == "http://opac.test/"
    assert settings.koha_api_timeout == 9.0
    get_settings.cache_clear()
