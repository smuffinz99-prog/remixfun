// Remix.fun on-chain core: builds the launch transaction and reads the registry.
// Works in the browser (window.RemixCore, needs window.solanaWeb3) and in Node (module.exports).
(function (root) {
  const REGISTRY = 'BHbtWD3Vn8hgVCwsPg6UQB7EDrk35fupshMuMy4Qg3vu'; // no owner; tagged read-only on every launch
  const SYSTEM_PROGRAM = '11111111111111111111111111111111';
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const MEMO_TAG = 'remix.fun:v1';
  const LAUNCH_PROGRAMS = [SYSTEM_PROGRAM, TOKEN_PROGRAM, METADATA_PROGRAM, ATA_PROGRAM, TOKEN_PROGRAM, TOKEN_PROGRAM, MEMO_PROGRAM];
  const MAX_MINT_RENT = 3000000; // lamports; mint rent is ~1.46M, anything above this is refused
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/; // memos are untrusted: only real addresses/signatures get through
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  // Control, zero-width and bidi-override characters let names impersonate other coins; strip them.
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁯﻿￹-￻]/g, '').trim().slice(0, n);

  const enc = new TextEncoder();
  const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const u64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
  const str = s => { const b = enc.encode(s); return [u32(b.length), b]; };
  const cat = parts => { const flat = parts.flat(); const out = new Uint8Array(flat.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of flat) { out.set(p, o); o += p.length; } return out; };

  function makeLauncher(w) {
    const Buf = w.PublicKey.default.toBuffer().constructor; // web3.js's bundled Buffer
    const pk = s => new w.PublicKey(s);
    const ix = (programId, keys, data) => new w.TransactionInstruction({ programId: pk(programId), keys, data: Buf.from(data) });
    const acc = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });

    function ata(owner, mint) {
      return w.PublicKey.findProgramAddressSync([owner.toBuffer(), pk(TOKEN_PROGRAM).toBuffer(), mint.toBuffer()], pk(ATA_PROGRAM))[0];
    }
    function metadataPda(mint) {
      const p = pk(METADATA_PROGRAM);
      return w.PublicKey.findProgramAddressSync([Buf.from('metadata'), p.toBuffer(), mint.toBuffer()], p)[0];
    }

    // One transaction: create mint, metadata, creator ATA, mint full supply, lock supply, memo with lineage.
    async function buildLaunchTx(conn, { payer, mint: mintKp, name, symbol, supply, parent = null, parentName = '', parentTicker = '', emoji = '' }) {
      const decimals = 6;
      name = clean(name, 64); symbol = clean(symbol, 10);
      if (!name || enc.encode(name).length > 32) throw new Error('Name must be 1 to 32 characters.');
      if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw new Error('Ticker must be 2 to 10 letters or numbers.');
      if (!/^\d+$/.test(String(supply)) || BigInt(supply) < 1n || BigInt(supply) > 1000000000000n) throw new Error('Supply must be between 1 and 1,000,000,000,000.');
      if (parent !== null && !ADDR.test(parent)) throw new Error('Parent must be a token address.');
      const mint = mintKp.publicKey;
      const rent = await conn.getMinimumBalanceForRentExemption(82);
      if (!(rent > 0 && rent <= MAX_MINT_RENT)) throw new Error('The network returned an unexpected rent amount. Nothing was signed.');
      const owner = ata(payer, mint);
      const memo = JSON.stringify(Object.assign({ app: MEMO_TAG, mint: mint.toBase58(), name, t: symbol, e: clean(emoji, 8), p: parent },
        parent ? { pn: clean(parentName, 32), pt: clean(parentTicker, 12) } : {}));
      const ixs = [
        w.SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, lamports: rent, space: 82, programId: pk(TOKEN_PROGRAM) }),
        // InitializeMint2: decimals, mint authority = payer, no freeze authority. Registry rides along read-only so launches are indexable.
        ix(TOKEN_PROGRAM, [acc(mint, false, true), acc(pk(REGISTRY), false, false)], cat([[new Uint8Array([20, decimals])], [payer.toBytes()], [new Uint8Array([0])]])),
        // Metaplex CreateMetadataAccountV3
        ix(METADATA_PROGRAM, [
          acc(metadataPda(mint), false, true), acc(mint, false, false), acc(payer, true, false),
          acc(payer, true, true), acc(payer, true, false), acc(w.SystemProgram.programId, false, false),
        ], cat([[new Uint8Array([33])], str(name), str(symbol), str(''), [new Uint8Array([0, 0, 0, 0, 0, 1, 0])]])),
        // Create associated token account (idempotent)
        ix(ATA_PROGRAM, [
          acc(payer, true, true), acc(owner, false, true), acc(payer, false, false), acc(mint, false, false),
          acc(w.SystemProgram.programId, false, false), acc(pk(TOKEN_PROGRAM), false, false),
        ], [1]),
        // MintTo full supply
        ix(TOKEN_PROGRAM, [acc(mint, false, true), acc(owner, false, true), acc(payer, true, false)],
          cat([[new Uint8Array([7])], [u64(BigInt(supply) * 10n ** BigInt(decimals))]])),
        // SetAuthority(MintTokens -> None): supply is fixed forever
        ix(TOKEN_PROGRAM, [acc(mint, false, true), acc(payer, true, false)], [6, 0, 0]),
        ix(MEMO_PROGRAM, [], enc.encode(memo)),
      ];
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const tx = new w.Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs);
      checkLaunchTx(tx, payer, mint);
      tx.partialSign(mintKp);
      return { tx, blockhash, lastValidBlockHeight };
    }

    // Independent check of exactly what the wallet will be asked to sign. Throws if anything is off.
    function checkLaunchTx(tx, payer, mint) {
      const bad = why => { throw new Error('Safety check failed (' + why + '). Nothing was signed.'); };
      const p58 = payer.toBase58(), m58 = mint.toBase58(), owner = ata(payer, mint).toBase58();
      if (!tx.feePayer || tx.feePayer.toBase58() !== p58) bad('fee payer');
      const ids = tx.instructions.map(i => i.programId.toBase58());
      if (ids.length !== LAUNCH_PROGRAMS.length || ids.some((id, i) => id !== LAUNCH_PROGRAMS[i])) bad('unexpected program');
      const ca = w.SystemInstruction.decodeCreateAccount(tx.instructions[0]);
      if (ca.fromPubkey.toBase58() !== p58 || ca.newAccountPubkey.toBase58() !== m58 || ca.space !== 82 ||
          ca.programId.toBase58() !== TOKEN_PROGRAM || ca.lamports > MAX_MINT_RENT) bad('account creation');
      const [, init, , ataIx, mintTo, lock] = tx.instructions;
      if (init.data[0] !== 20 || init.keys[0].pubkey.toBase58() !== m58) bad('mint setup');
      if (ataIx.keys[1].pubkey.toBase58() !== owner || ataIx.keys[2].pubkey.toBase58() !== p58) bad('token account');
      if (mintTo.data[0] !== 7 || mintTo.keys[1].pubkey.toBase58() !== owner) bad('supply destination');
      if (lock.data[0] !== 6 || lock.data[1] !== 0 || lock.data[2] !== 0) bad('mint lock');
      // Only the payer and the new mint may sign; the payer is the only account that spends SOL.
      const signers = new Set(tx.instructions.flatMap(i => i.keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58())));
      signers.delete(p58); signers.delete(m58);
      if (signers.size) bad('extra signer');
      return true;
    }

    // Every launch tags the registry, so its signature list (with memos) is the full launch log.
    async function fetchLaunches(conn, pages = 3) {
      const out = [];
      let before;
      for (let page = 0; page < pages; page++) {
        const sigs = await conn.getSignaturesForAddress(pk(REGISTRY), before ? { limit: 1000, before } : { limit: 1000 });
        for (const s of sigs) {
          if (s.err || !s.memo || !B58.test(s.signature)) continue;
          const i = s.memo.indexOf('{');
          try {
            const m = JSON.parse(s.memo.slice(i));
            if (m.app !== MEMO_TAG || !ADDR.test(m.mint) || (m.p && !ADDR.test(m.p))) continue;
            out.push({ id: m.mint, name: clean(m.name, 32), t: clean(m.t, 10), e: clean(m.e, 8) || '🧬', p: m.p || null, sig: s.signature, time: s.blockTime,
              pn: m.p ? clean(m.pn, 32) : '', pt: m.p ? clean(m.pt, 12) : '' });
          } catch (_) {}
        }
        if (sigs.length < 1000) break;
        before = sigs[sigs.length - 1].signature;
      }
      return out;
    }

    // A registry entry is only real if its own transaction initialized that mint.
    // This rejects spam memos and anyone claiming an existing coin as "their remix".
    async function verifyLaunch(conn, launch) {
      const tx = await conn.getTransaction(launch.sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      if (!tx || !tx.meta || tx.meta.err) return false;
      const msg = tx.transaction.message, keys = msg.staticAccountKeys.map(k => k.toBase58());
      return msg.compiledInstructions.some(i => keys[i.programIdIndex] === TOKEN_PROGRAM && i.data[0] === 20 && keys[i.accountKeyIndexes[0]] === launch.id);
    }

    // Look up any SPL / Token-2022 mint: confirms it exists and reads its on-chain name + symbol.
    async function lookupMint(conn, ca) {
      ca = String(ca || '').trim();
      if (!ADDR.test(ca)) throw new Error('That is not a valid Solana address.');
      const key = pk(ca);
      const info = await conn.getParsedAccountInfo(key);
      const d = info.value && info.value.data;
      if (!d || !d.parsed || d.parsed.type !== 'mint') throw new Error('No token found at that address. Paste the token contract address (CA), not a wallet or pool.');
      const out = { id: ca, name: '', t: '', decimals: d.parsed.info.decimals, program: d.program };
      const ext = (d.parsed.info.extensions || []).find(e => e.extension === 'tokenMetadata');
      if (ext && ext.state) { out.name = ext.state.name || ''; out.t = ext.state.symbol || ''; }
      if (!out.name) {
        try {
          const md = await conn.getAccountInfo(metadataPda(key));
          if (md && md.data) {
            const b = md.data, dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
            let o = 65;
            const rd = () => { const n = dv.getUint32(o, true); if (n > 200) throw new Error('bad metadata'); o += 4; const v = dec.decode(b.slice(o, o + n)); o += n; return v; };
            out.name = rd(); out.t = rd();
          }
        } catch (_) {}
      }
      out.name = clean(out.name, 32); out.t = clean(out.t, 12).replace(/^\$/, '');
      return out;
    }

    return { buildLaunchTx, checkLaunchTx, fetchLaunches, verifyLaunch, lookupMint };
  }

  const api = { REGISTRY, makeLauncher, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RemixCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
