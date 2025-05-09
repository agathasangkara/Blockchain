const fs = require('fs');
const bs58 = require('bs58');
const web3 = require('@solana/web3.js');
const fetch = require('node-fetch');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const splToken = require('@solana/spl-token');

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const PROXY = config.proxy;
const RECIPIENT_INPUT = config.recipient;
const TX_FEE_LAMPORTS = config.fee_lamport;
const PRIVATEKEY = config.privatekey_sender;
const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;

const proxyAgent = new HttpsProxyAgent(PROXY);
const connection = new web3.Connection("https://api.mainnet-beta.solana.com", {
  commitment: 'processed',
  fetch: (url, options = {}) => fetch(url, { ...options, agent: proxyAgent })
});

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function isValidBase58(str) {
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(str);
}

async function executeClaimAndTransfer() {
  const keys = fs.readFileSync("private_key.txt", "utf-8").split("\n").map(l => l.trim()).filter(isValidBase58);
  const recipient = new web3.PublicKey(RECIPIENT_INPUT);
  for (let index = 0; index < keys.length; index++) {
    const secretKey = bs58.decode(keys[index]);
    const payer = web3.Keypair.fromSecretKey(secretKey);
    const label = `Account_${index + 1}`;
    let balance;
    try { balance = await connection.getBalance(payer.publicKey); } catch { continue; }
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log(`\n[INFO]  [${label}] ${payer.publicKey.toBase58()}`);
    console.log(`[INFO]  [${label}] Saldo awal: ${solBalance.toFixed(9)} SOL`);
    let tokenAccounts;
    try {
      tokenAccounts = await connection.getParsedTokenAccountsByOwner(payer.publicKey, {
        programId: new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });
    } catch { continue; }
    const vacantAccounts = tokenAccounts.value.filter(acc => parseFloat(acc.account.data.parsed.info.tokenAmount.uiAmountString) === 0);
    const reclaim = vacantAccounts.length * 2039280;
    if (vacantAccounts.length > 0) {
      console.log(`[INFO]  [${label}] Reward Burn: ${(reclaim / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      if (balance < TX_FEE_LAMPORTS) {
        console.log(`[WARN]  [${label}] Tidak cukup saldo untuk TX fee burn`);
    }
    } else {
      console.log(`[INFO]  [${label}] Potensi Burn None`);
    }
    if (vacantAccounts.length > 0 && balance >= TX_FEE_LAMPORTS && balance + reclaim >= TX_FEE_LAMPORTS * 2) {
      const closeTx = new web3.Transaction();
      vacantAccounts.forEach(acc => {
        closeTx.add(splToken.createCloseAccountInstruction(new web3.PublicKey(acc.pubkey), payer.publicKey, payer.publicKey));
      });
      closeTx.feePayer = payer.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      closeTx.recentBlockhash = blockhash;
      closeTx.sign(payer);
      try {
        const sig = await connection.sendRawTransaction(closeTx.serialize(), { skipPreflight: true });
        console.log(`[INFO]  [${label}] Burn TX: https://solscan.io/tx/${sig}`);
      } catch {}
    }
    const updatedBalance = await connection.getBalance(payer.publicKey);
    if (updatedBalance > TX_FEE_LAMPORTS) {
      const transferAmount = updatedBalance - TX_FEE_LAMPORTS;
      const transferTx = new web3.Transaction().add(
        web3.SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: transferAmount })
      );
      transferTx.feePayer = payer.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transferTx.recentBlockhash = blockhash;
      transferTx.sign(payer);
      try {
        const sig = await connection.sendRawTransaction(transferTx.serialize(), { skipPreflight: true });
        console.log(`[SUCCESS] [${label}] Transfer TX: https://solscan.io/tx/${sig}`);
      } catch {}
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function executeSweepTransfer() {
  const recipient = new web3.PublicKey(RECIPIENT_INPUT);
  const keys = fs.readFileSync("private_key.txt", "utf-8").split("\n").map(l => l.trim()).filter(isValidBase58);
  for (let i = 0; i < keys.length; i++) {
    const secret = bs58.decode(keys[i]);
    const wallet = web3.Keypair.fromSecretKey(secret);
    let balance = await connection.getBalance(wallet.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log(`\n[INFO]  [account_${i + 1}] ${wallet.publicKey.toBase58()}`);
    console.log(`[INFO]  [account_${i + 1}] Saldo: ${solBalance.toFixed(9)} SOL`);
    if (balance <= TX_FEE_LAMPORTS) {
      console.log(`[WARN]  [account_${i + 1}] Tidak cukup saldo`);
      continue;
    }
    if (balance <= TX_FEE_LAMPORTS) continue;
    const toSend = balance - TX_FEE_LAMPORTS;
    const tx = new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: recipient, lamports: toSend }));
    tx.feePayer = wallet.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(wallet);
    try {
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      console.log(`[SUCCESS] [account_${i + 1}] TX: https://solscan.io/tx/${sig}`);
    } catch {}
  }
}

async function executeDistributeTransfer() {
  try {
    const secret = bs58.decode(PRIVATEKEY);
    const sender = web3.Keypair.fromSecretKey(secret);
    const list = fs.readFileSync("address.txt", "utf-8").split("\n").map(l => l.trim()).filter(isValidBase58);

    const mode = await prompt("\n1=sama rata, 2=input manual : ");
    let nominal = 0;
    if (mode === '1') {
      const input = await prompt("Masukkan nominal SOL per address: ");
      nominal = Math.floor(parseFloat(input) * LAMPORTS_PER_SOL);
    }

    for (let i = 0; i < list.length; i++) {
      let lamports = nominal;
      if (mode === '2') {
        const input = await prompt(`Jumlah SOL untuk ${list[i]}: `);
        lamports = Math.floor(parseFloat(input) * LAMPORTS_PER_SOL);
      }

      let balance;
      try {
        balance = await connection.getBalance(sender.publicKey);
      } catch (err) {
        const msg = err.message || "";
        if (msg.includes("Proxy connection ended") || msg.includes("TLS")) {
          console.log(`[WARN]  [sender] Gagal koneksi ke RPC. Coba ulang...`);
          i--;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        console.log(`[ERROR] [sender] ${msg}`);
        continue;
      }

      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log(`\n[INFO]  [to_${i + 1}] ${sender.publicKey.toBase58()} → ${list[i]}`);
      console.log(`[INFO]  [to_${i + 1}] Saldo pengirim: ${solBalance.toFixed(9)} SOL`);

      if (balance < lamports + TX_FEE_LAMPORTS) {
        console.log(`[WARN]  [to_${i + 1}] Tidak cukup saldo untuk kirim ${lamports / LAMPORTS_PER_SOL} SOL`);
        continue;
      }

      const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: new web3.PublicKey(list[i]),
        lamports
      }));

      tx.feePayer = sender.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(sender);

      try {
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(`[SUCCESS] to_${i + 1}: https://solscan.io/tx/${sig}`);
      } catch (err) {
        console.log(`[ERROR]  [to_${i + 1}] Gagal kirim: ${err.message || err}`);
      }
    }
  } catch (e) {
    console.log(`[FATAL] Gagal memulai distribusi: ${e.message || e}`);
  }
}

function executeExtractAddresses() {
  const keys = fs.readFileSync("private_key.txt", "utf-8").split("\n").map(line => line.trim()).filter(isValidBase58);
  const addresses = keys.map(key => {
    const keypair = web3.Keypair.fromSecretKey(bs58.decode(key));
    return keypair.publicKey.toBase58();
  });
  fs.writeFileSync("address_extracted.txt", addresses.join("\n"));
  console.log(`Simpan ${addresses.length} address ke address_extracted.txt`);
}

async function executeGenerateWallets() {
  const input = await prompt("\nBerapa wallet yang ingin dibuat: ");
  const total = parseInt(input);
  const result = [];
  for (let i = 0; i < total; i++) {
    const kp = web3.Keypair.generate();
    result.push(`${kp.publicKey.toBase58()}|${bs58.encode(kp.secretKey)}`);
  }
  fs.writeFileSync("addresses_solana_new.txt", result.join("\n"));
  console.log(`Berhasil bikin ${total} address dan disimpan ke addresses_solana_new.txt`);
}

(async () => {
  console.log("1. Check SOL Burn dan kirim ke 1 address");
  console.log("2. Transfer semua dari banyak privatekey ke satu address");
  console.log("3. Transfer dari satu privatekey ke banyak address");
  console.log("4. Extract address dari privatekey");
  console.log("5. Generate wallet baru");
  const mode = await prompt("\nPilih : ");
  if (mode === '1') await executeClaimAndTransfer();
  else if (mode === '2') await executeSweepTransfer();
  else if (mode === '3') await executeDistributeTransfer();
  else if (mode === '4') executeExtractAddresses();
  else if (mode === '5') await executeGenerateWallets();
  else console.log("Input tidak valid.");
})();