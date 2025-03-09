import base58
import base64
from solders.keypair import Keypair

def generate_signature(message: str, private_key: str, use_base64: bool = False) -> str:
    private_key_bytes = base58.b58decode(private_key)
    keypair = Keypair.from_bytes(private_key_bytes)
    signature = keypair.sign_message(message.encode())
    if use_base64:
        return base64.b64encode(bytes(signature)).decode()
    return base58.b58encode(bytes(signature)).decode()

message = "message_signature"
private_key = "private_key_address"

signature_base58 = generate_signature(message, private_key, use_base64=False)
signature_base64 = generate_signature(message, private_key, use_base64=True)

print("Signature (Base58):", signature_base58)
print("Signature (Base64):", signature_base64)
