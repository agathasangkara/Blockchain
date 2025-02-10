import base58
import base64
from solders.keypair import Keypair

def generate_signature(message: str, private_key: str) -> str:
    private_key_bytes = base58.b58decode(private_key)
    keypair = Keypair.from_bytes(private_key_bytes)
    signature = keypair.sign_message(message.encode())
    return base64.b64encode(bytes(signature)).decode()
