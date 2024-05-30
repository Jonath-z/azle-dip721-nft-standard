import {
  blob,
  Canister,
  ic,
  nat64,
  nat,
  Principal,
  query,
  update,
  Variant,
  Vec,
  init,
  text,
  nat8,
  nat32,
  Record,
  Opt,
  Result,
  Ok,
  Err,
} from "azle";

const MetadataVal = Variant({
  TextContent: text,
  BlobContent: blob,
  NatContent: nat,
  Nat8Content: nat8,
  Nat16Content: nat8,
  Nat32Content: nat32,
  Nat64Content: nat64,
});

const LogoResult = Record({
  logo_type: text,
  data: text,
});

const MetadataKeyVal = Record({
  key: text,
  val: MetadataVal,
});

const MintResult = Record({
  tokenId: nat64,
  id: nat,
});

const MetadataPart = Record({
  key_val_data: Vec(MetadataKeyVal),
  data: blob,
});

const MetadataDesc = Vec(MetadataPart);

const Error = Variant({
  Unauthorized: text,
  InvalidTokenId: text,
  ZeroAddress: text,
  Other: text,
});

const InitArgs = Record({
  logo: LogoResult,
  name: text,
  symbol: text,
});

const Nft = Record({
  owner: Principal,
  approved: Opt(Principal),
  id: nat64,
  metadata: MetadataDesc,
});

const State = Record({
  nfts: Vec(Nft),
  custodians: Vec(Principal),
  logo: LogoResult,
  name: text,
  symbol: text,
  txid: nat,
});

let state: State = {
  nfts: [],
  custodians: [],
  name: "",
  symbol: "",
  txid: 0n,
};

export default Canister({
  init: init([Principal, InitArgs], (custodian, args) => {
    state.custodians = [custodian];
    state.name = args.name;
    state.symbol = args.symbol;
    state.logo = args.logo;
  }),

  balanceOf: query([Principal], nat64, (user) => {
    return BigInt(
      state.nfts.filter(
        (n: { owner: { toText: () => string } }) =>
          n.owner.toText() === user.toText()
      ).length
    );
  }),

  ownerOf: query([nat64], Result(Principal, Error), (tokenId) => {
    const nft = state.nfts[Number(tokenId)];
    if (nft) {
      return Ok(nft.owner);
    } else {
      return Err({ InvalidTokenId: "true" });
    }
  }),

  logo: query([], Result(LogoResult, Error), () => {
    return state.logo ? Ok(state.logo) : Err({ Other: "true" });
  }),

  name: query([], text, () => {
    return state.name;
  }),

  symbol: query([], text, () => {
    return state.symbol;
  }),

  totalSupply: query([], nat64, () => {
    return BigInt(state.nfts.length);
  }),

  getMetadata: query([nat64], Result(MetadataDesc, Error), (tokenId) => {
    const nft = state.nfts[Number(tokenId)];
    if (nft) {
      return Ok(nft.metadata);
    } else {
      return Err({ InvalidTokenId: "true" });
    }
  }),

  getMetadataForUser: query([Principal], Vec(MetadataDesc), (user) => {
    return state.nfts
      .filter(
        (n: { owner: { toText: () => string } }) =>
          n.owner.toText() === user.toText()
      )
      .map((n: { metadata: any }) => n.metadata);
  }),

  mint: update(
    [Principal, MetadataDesc],
    Result(MintResult, Error),
    (to, metadata) => {
      console.log({ metadata });
      const newId = BigInt(state.nfts.length);
      const nft = {
        owner: to,
        approved: undefined,
        id: newId,
        metadata,
      };
      state.nfts.push(nft);
      return Ok({ id: nextTxId(), tokenId: newId });
    }
  ),

  safeTransferFrom: update(
    [Principal, Principal, nat],
    Result(nat, Error),
    (from: Principal, to: Principal, tokenId: nat) => {
      if (to.toText() === Principal.anonymous().toText()) {
        return Err({ ZeroAddress: "true" });
      } else {
        return transferFrom(from, to, tokenId);
      }
    }
  ),

  burn: update([nat64], Result(nat, Error), (tokenId) => {
    const nft = state.nfts[Number(tokenId)];
    if (nft.owner.toText() !== ic.caller().toText()) {
      return Err({ Unauthorized: "true" });
    }
    nft.owner = Principal.anonymous();
    return Ok(nextTxId());
  }),
});

function transferFrom(from: Principal, to: Principal, tokenId: nat) {
  const nft = state.nfts[Number(tokenId)];

  if (!nft) {
    return Err({ InvalidTokenId: "true" });
  }
  if (
    nft.owner.toText() !== from.toText() &&
    nft.approved?.toText() !== from.toText()
  ) {
    return Err({ Unauthorized: "true" });
  }
  if (nft.owner.toText() !== from.toText()) {
    return Err({ Other: "true" });
  }
  nft.approved = to;
  nft.owner = to;
  return Ok(nextTxId());
}

function nextTxId(): nat {
  state.txid += 1n;
  return state.txid;
}
