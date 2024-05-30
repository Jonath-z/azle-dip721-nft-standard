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
  bool,
  None,
} from "azle";

const MetadataDesc = Vec(MetadataPart);
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
  logoType: text,
  data: text,
});

const MetadataPart = Record({
  purpose: MetadataPurpose,
  keyValData: Map(text, MetadataVal),
  data: blob,
});

const MetadataPurpose = Record({
  Preview: text,
  Rendered: text,
});

const MintResult = Record({
  tokenId: nat64,
  id: nat,
});

const Error = Variant({
  Unauthorized: text,
  InvalidTokenId: text,
  ZeroAddress: text,
  Other: text,
});

const InitArgs = Record({
  custodians: Opt(Vec(Principal)),
  logo: Opt(LogoResult),
  name: text,
  symbol: text,
});

const Nft = Record({
  owner: Principal,
  approved: Opt(Principal),
  id: nat64,
  metadata: MetadataDesc,
  content: blob,
});

const State = Record({
  nfts: Vec(Nft),
  custodians: Vec(Principal),
  operators: Map(Principal, Vec(Principal)),
  logo: LogoResult,
  name: text,
  symbol: text,
  txid: nat,
});

let state: State = {
  nfts: [],
  custodians: [],
  operators: ,
  name: "",
  symbol: "",
  txid: 0n,
};


export default Canister({
  init: init([InitArgs], (args) => {
    state.custodians = args.custodians || [ic.caller()];
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

  supportedInterfaces: query([], Vec(text), () => {
    return ["TransferNotification", "Burn", "Mint"];
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
    [Principal, MetadataDesc, blob],
    Result(MintResult, Error),
    (to, metadata, blobContent) => {
      if (!state.custodians.has(ic.caller())) {
        return Err({ Unauthorized: "true" });
      }
      const newId = BigInt(state.nfts.length);
      const nft = {
        owner: to,
        approved: undefined,
        id: newId,
        metadata,
        content: blobContent,
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

  setName: update([text], Result(Record({}), Error), (name) => {
    if (state.custodians.has(ic.caller())) {
      state.name = name;
      return Ok({});
    } else {
      return Err({ Unauthorized: "true" });
    }
  }),

  setSymbol: update([text], Result(Record({}), Error), (symbol) => {
    if (state.custodians.has(ic.caller())) {
      state.symbol = symbol;
      return Ok({});
    } else {
      return Err({ Unauthorized: "true" });
    }
  }),

  setLogo: update([LogoResult], Result(Record({}), Error), (logo) => {
    if (state.custodians.has(ic.caller())) {
      state.logo = logo;
      return Ok({});
    } else {
      return Err({ Unauthorized: "true" });
    }
  }),

  setCustodian: update(
    [Principal, bool],
    Result(Record({}), Error),
    (user, custodian) => {
      if (state.custodians.has(ic.caller())) {
        if (custodian) {
          state.custodians.add(user);
        } else {
          state.custodians.delete(user);
        }
        return Ok({});
      } else {
        return Err({ Unauthorized: "true" });
      }
    }
  ),

  isCustodian: query([Principal], bool, (principal) => {
    return state.custodians.has(principal);
  }),
});

function transferFrom(from: Principal, to: Principal, tokenId: nat) {
  const nft = state.nfts[Number(tokenId)];
  const caller = ic.caller();
  if (!nft) {
    return Err({ InvalidTokenId: "true" });
  }
  if (
    nft.owner.toText() !== caller.toText() &&
    nft.approved?.toText() !== caller.toText() &&
    !state.operators.get(from)?.has(caller) &&
    !state.custodians.has(caller)
  ) {
    return Err({ Unauthorized: "true" });
  }
  if (nft.owner.toText() !== from.toText()) {
    return Err({ Other: "true" });
  }
  nft.approved = undefined;
  nft.owner = to;
  return Ok(nextTxId());
}

function nextTxId(): nat {
    const txid = state.txid;
    state.txid += 1n;
    return txid;
  }
  
