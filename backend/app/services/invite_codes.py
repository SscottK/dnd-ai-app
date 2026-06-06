import secrets
import string

INVITE_ALPHABET = string.ascii_uppercase + string.digits


def generate_invite_code(length: int = 6) -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(length))
