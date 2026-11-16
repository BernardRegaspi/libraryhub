from app.services.passwords import hash_password, verify_password
from app.services.tokens import hash_secret, new_secret


def test_password_round_trip():
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong", stored)
    assert stored != "correct horse"


def test_secret_is_hashed():
    raw = new_secret()
    assert raw not in hash_secret(raw)
    assert hash_secret(raw) == hash_secret(raw)
    assert len(raw) >= 32