from eth_keys import keys
from eth_utils import keccak
from eth_account import Account
from eth_account.messages import encode_defunct

def generate_signature(message: str, private_key_hex: str):
    private_key = keys.PrivateKey(bytes.fromhex(private_key_hex[2:]))
    return private_key.sign_msg_hash(keccak(f"\x19Ethereum Signed Message:\n{len(message)}".encode() + message.encode())).to_hex()

def generate_signature_v2(message: str, private_key: str):
    encoded_message = encode_defunct(text=message)
    signed_message = Account.sign_message(encoded_message, private_key=private_key)
    return signed_message.signature.hex()


# Single signature etherium
