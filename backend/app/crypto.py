"""Hashing, canonical JSON, AES-GCM per-item encryption, ECDSA P-256 (WebCrypto-compatible), Merkle roots."""
import base64
import hashlib
import json
import os
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

EMPTY_ROOT = "0" * 64


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def canonical(obj: Any) -> bytes:
    """Deterministic JSON: sorted keys, no whitespace, UTF-8. Clients must use the same rule."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode()


def b64d(s: str) -> bytes:
    s = s.strip()
    s += "=" * (-len(s) % 4)
    try:
        return base64.b64decode(s, altchars=b"-_") if ("-" in s or "_" in s) else base64.b64decode(s)
    except Exception as e:
        raise ValueError(f"invalid base64: {e}")


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


# ---------- AES-GCM ----------
def new_key() -> bytes:
    return AESGCM.generate_key(bit_length=256)


def aes_encrypt(key: bytes, plaintext: bytes, aad: bytes = b"") -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return nonce, AESGCM(key).encrypt(nonce, plaintext, aad)


def aes_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, aad: bytes = b"") -> bytes:
    return AESGCM(key).decrypt(nonce, ciphertext, aad)


# ---------- ECDSA P-256 ----------
def gen_keypair() -> tuple[bytes, dict]:
    priv = ec.generate_private_key(ec.SECP256R1())
    pem = priv.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return pem, public_jwk(priv.public_key())


def public_jwk(pub: ec.EllipticCurvePublicKey) -> dict:
    n = pub.public_numbers()
    return {"kty": "EC", "crv": "P-256", "x": b64u(n.x.to_bytes(32, "big")), "y": b64u(n.y.to_bytes(32, "big"))}


def load_public(pk: Any) -> ec.EllipticCurvePublicKey:
    """Accept a JWK dict or a base64/hex raw uncompressed point (65 bytes)."""
    if isinstance(pk, dict):
        x = int.from_bytes(b64d(pk["x"]), "big")
        y = int.from_bytes(b64d(pk["y"]), "big")
        return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
    if isinstance(pk, str):
        raw = bytes.fromhex(pk) if all(c in "0123456789abcdefABCDEF" for c in pk) and len(pk) == 130 else b64d(pk)
        return ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
    raise ValueError("unsupported public key format")


def sign(private_pem: bytes, message: bytes) -> str:
    """Returns base64 of raw r||s (64 bytes), the same shape WebCrypto produces for ECDSA P-256."""
    priv = serialization.load_pem_private_key(private_pem, password=None)
    der = priv.sign(message, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return b64e(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


def verify(pub: Any, message: bytes, signature_b64: str) -> bool:
    try:
        key = load_public(pub)
        raw = b64d(signature_b64)
        der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")) if len(raw) == 64 else raw
        key.verify(der, message, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, KeyError, TypeError):
        return False
    except Exception:
        return False


_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def did_key_p256(jwk: dict) -> str:
    """did:key for a P-256 key: multibase base58btc of (0x8024 varint + compressed point)."""
    x = b64d(jwk["x"])
    y = b64d(jwk["y"])
    prefix = b"\x02" if y[-1] % 2 == 0 else b"\x03"
    data = b"\x80\x24" + prefix + x
    n = int.from_bytes(data, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    out = "1" * (len(data) - len(data.lstrip(b"\x00"))) + out
    return "did:key:z" + out


# ---------- Merkle ----------
def merkle_root(leaves: list[str]) -> str:
    """Sorted-leaf SHA-256 Merkle root (hex). Empty set -> 64 zeros. Odd node is promoted-by-duplication."""
    if not leaves:
        return EMPTY_ROOT
    level = [bytes.fromhex(h) for h in sorted(leaves)]
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [hashlib.sha256(level[i] + level[i + 1]).digest() for i in range(0, len(level), 2)]
    return level[0].hex()
