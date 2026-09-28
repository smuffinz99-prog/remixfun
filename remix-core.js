// Remix.fun on-chain core: builds the launch transaction and reads the registry.
// Works in the browser (window.RemixCore, needs window.solanaWeb3) and in Node (module.exports).
(function (root) {
  const REGISTRY = 'BHbtWD3Vn8hgVCwsPg6UQB7EDrk35fupshMuMy4Qg3vu'; // no owner; tagged read-only on every launch
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const MEMO_TAG = 'remix.fun:v1';
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/; // memos are untrusted: only real addresses/signatures get through

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
    async function buildLaunchTx(conn, { payer, mint: mintKp, name, symbol, uri = '', supply, decimals = 6, parent = null, parentName = '', parentTicker = '', emoji = '' }) {
      const mint = mintKp.publicKey;
      const rent = await conn.getMinimumBalanceForRentExemption(82);
      const owner = ata(payer, mint);
      const memo = JSON.stringify(Object.assign({ app: MEMO_TAG, mint: mint.toBase58(), name, t: symbol, e: emoji, p: parent },
        parent ? { pn: String(parentName).slice(0, 32), pt: String(parentTicker).slice(0, 12) } : {}));
      const ixs = [
        w.SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, lamports: rent, space: 82, programId: pk(TOKEN_PROGRAM) }),
        // InitializeMint2: decimals, mint authority = payer, no freeze authority. Registry rides along read-only so launches are indexable.
        ix(TOKEN_PROGRAM, [acc(mint, false, true), acc(pk(REGISTRY), false, false)], cat([[new Uint8Array([20, decimals])], [payer.toBytes()], [new Uint8Array([0])]])),
        // Metaplex CreateMetadataAccountV3
        ix(METADATA_PROGRAM, [
          acc(metadataPda(mint), false, true), acc(mint, false, false), acc(payer, true, false),
          acc(payer, true, true), acc(payer, true, false), acc(w.SystemProgram.programId, false, false),
        ], cat([[new Uint8Array([33])], str(name), str(symbol), str(uri), [new Uint8Array([0, 0, 0, 0, 0, 1, 0])]])),
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
      tx.partialSign(mintKp);
      return { tx, blockhash, lastValidBlockHeight };
    }

    // Every launch tags the registry, so its signature list (with memos) is the full launch log.
    async function fetchLaunches(conn, limit = 1000) {
      const sigs = await conn.getSignaturesForAddress(pk(REGISTRY), { limit });
      const out = [];
      for (const s of sigs) {
        if (s.err || !s.memo) continue;
        const i = s.memo.indexOf('{');
        try {
          const m = JSON.parse(s.memo.slice(i));
          if (m.app !== MEMO_TAG || !B58.test(m.mint) || (m.p && !B58.test(m.p)) || !B58.test(s.signature)) continue;
          out.push({ id: m.mint, name: String(m.name || '').slice(0, 32), t: String(m.t || '').slice(0, 10), e: String(m.e || '🧬').slice(0, 8), p: m.p || null, sig: s.signature, time: s.blockTime,
            pn: m.p ? String(m.pn || '').slice(0, 32) : '', pt: m.p ? String(m.pt || '').slice(0, 12) : '' });
        } catch (_) {}
      }
      return out;
    }

    // Look up any SPL / Token-2022 mint: confirms it exists and reads its on-chain name + symbol.
    async function lookupMint(conn, ca) {
      ca = String(ca || '').trim();
      if (!B58.test(ca) || ca.length > 44) throw new Error('That is not a valid Solana address.');
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
            const rd = () => { const n = dv.getUint32(o, true); o += 4; const v = dec.decode(b.slice(o, o + n)); o += n; return v.replace(/\u0000/g, '').trim(); };
            out.name = rd(); out.t = rd();
          }
        } catch (_) {}
      }
      out.name = out.name.slice(0, 32); out.t = out.t.replace(/^\$/, '').slice(0, 12);
      return out;
    }

    return { buildLaunchTx, fetchLaunches, lookupMint };
  }

  const api = { REGISTRY, makeLauncher };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RemixCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
