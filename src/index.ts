import {
  http,
  getContract,
  createWalletClient,
  createPublicClient,
} from "viem";
import axios from "axios";

import { sepolia, etherlinkTestnet, etherlink } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import dotenv from "dotenv";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import {
  AbiCoder,
  randomBytes,
  parseEther,
  parseUnits,
  JsonRpcProvider,
  Wallet as PKWallet,
  Interface,
  Signature,
  TransactionRequest,
  Signer,
} from "ethers";

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";

// import { handlerABI } from "../abi/handler";

// import { ResolverABI } from "../abi/Resolver";

import Contract from "../abi/Resolver.json";

import {
  sepoliaEscrowFactoryContract,
  sepoliaLimitOrderContract,
  sepoliaUSDCContract,
  etherlinkUSDCContract,
  tezosTokenContractAddress,
  tezosEscrowSrcFactoryContractAddress,
  tezosEscrowDstFactoryContractAddress,
} from "../config/utils";

dotenv.config(); // Load variables from .env

const makerPrivateKey = process.env.MAKER;
const takerPrivateKey = process.env.TAKER;

const makerTezosPrivateKey = process.env.MAKER_TEZOS;
const takerTezosPrivateKey = process.env.TAKER_TEZOS;

const makerTezosClient = new TezosToolkit("https://ghostnet.smartpy.io");

const takerTezosClient = new TezosToolkit("https://ghostnet.smartpy.io");

makerTezosClient.setProvider({
  signer: new InMemorySigner(makerTezosPrivateKey || ""),
});

takerTezosClient.setProvider({
  signer: new InMemorySigner(takerTezosPrivateKey || ""),
});

const makerAccount = privateKeyToAccount(makerPrivateKey as `0x${string}`);
const takerAccount = privateKeyToAccount(takerPrivateKey as `0x${string}`);

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const coder = AbiCoder.defaultAbiCoder();

const iface = new Interface(Contract.abi);

const takerClient = createWalletClient({
  account: takerAccount,
  chain: sepolia,
  transport: http(),
});

const resolverContractAddress =
  "0xcB1f7369E771D85EaaD96411296A3a1A81627DCa" as `0x${string}`;

// const ResolverContract = getContract({
//   address: resolverAddress,
//   abi: ResolverABI,
//   client: sepoliaClient,
// });

import * as Sdk from "@1inch/cross-chain-sdk";

async function startResolver(): Promise<void> {
  console.log(makerPrivateKey, makerAccount.address);
  console.log(takerPrivateKey, takerAccount.address);

  console.log("sepolia", sepolia.id);

  const secret = uint8ArrayToHex(randomBytes(32));
  const orderHash = uint8ArrayToHex(randomBytes(32));

  console.log("secret", secret);
  console.log("orderHash", orderHash);
  //
  const SrcPublicCancellation = 60 * 20;
  const SrcCancellation = 60 * 10;
  const SrcPublicWithdrawal = 60 * 8;
  const SrcWithdrawal = 20;
  const makingAmount = 100;
  const tokenId = 0;
  const tokenType = false;
  const safetyAmount = 2000000;

  const hash = Sdk.HashLock.forSingleFill(secret);
  const maker = await makerTezosClient.signer.publicKeyHash();
  const taker = await takerTezosClient.signer.publicKeyHash();

  console.log("hash", hash.toString());
  console.log("maker", maker);
  console.log("taker", taker);

  const TezostokenContract = await makerTezosClient.contract.at(
    tezosTokenContractAddress,
  );

  const approveOperation = await TezostokenContract.methods
    .approve(tezosEscrowSrcFactoryContractAddress, makingAmount)
    .send();

  console.log("Approve", approveOperation.hash);

  const TezosEscrowSrcFactoryContract = await takerTezosClient.contract.at(
    tezosEscrowSrcFactoryContractAddress,
  );

  console.log(
    TezosEscrowSrcFactoryContract.methods.deployEscrowSrc().getSignature(),
  );

  const deployContract = await TezosEscrowSrcFactoryContract.methods
    .deployEscrowSrc(
      SrcCancellation,
      SrcPublicCancellation,
      SrcPublicWithdrawal,
      SrcWithdrawal,
      makingAmount,
      hash.toString(),
      maker,
      orderHash,
      safetyAmount,
      taker,
      tezosTokenContractAddress,
      tokenId,
      tokenType,
    )
    .send({ amount: safetyAmount, mutez: true });

  console.log("Escrow", deployContract.hash);

  const api_resonse = await axios.get(
    `https://api.ghostnet.tzkt.io/v1/contracts/events?contract=KT1QchTYqYu7tw7hrPuX9ED8WhQeJtpYXViz&tag=deployedSrcEscrow&limit=1&sort.desc=id`,
  );

  console.log(api_resonse.data[0].payload);

  // SrcCancellation nat
  // SrcPublicCancellation nat
  // SrcPublicWithdrawal nat
  // SrcWithdrawal nat
  // amount nat
  // hash bytes
  // maker address
  // orderHash bytes
  // safetyDeposit mutez
  // taker address
  // token address
  // tokenId nat
  // tokenType bool
  //
}

function deploySrc(
  chainId: number,
  order: Sdk.CrossChainOrder,
  signature: string,
  takerTraits: Sdk.TakerTraits,
  amount: bigint,
  hashLock = order.escrowExtension.hashLockInfo,
): TransactionRequest {
  const { r, yParityAndS: vs } = Signature.from(signature);
  const { args, trait } = takerTraits.encode();
  const immutables = order.toSrcImmutables(
    chainId,
    new Sdk.Address(resolverContractAddress),
    amount,
    hashLock,
  );

  console.log("Immutables", immutables);

  return {
    to: resolverContractAddress,
    data: iface.encodeFunctionData("deploySrc", [
      immutables.build(),
      order.build(),
      r,
      vs,
      amount,
      trait,
      args,
    ]),
    value: order.escrowExtension.srcSafetyDeposit,
  };
}

// async function evmSwap() {
//   const sepoliaBlock = await sepoliaClient.getBlock({ blockTag: "latest" });

//   const srcTimestamp = sepoliaBlock.timestamp;
//   console.log("timestamp", srcTimestamp);

//   if (!sepoliaUSDCContract || !etherlinkUSDCContract) {
//     throw new Error("USDC contract address missing for Sepolia or Etherlink");
//   }

//   const order = Sdk.CrossChainOrder.new(
//     new Sdk.Address(sepoliaEscrowFactoryContract),
//     {
//       salt: Sdk.randBigInt(1000n),
//       maker: new Sdk.Address(makerAccount.address as string),
//       makingAmount: parseUnits("100", 1),
//       takingAmount: parseUnits("99", 1),
//       makerAsset: new Sdk.Address(sepoliaUSDCContract),
//       takerAsset: new Sdk.Address(etherlinkUSDCContract),
//     },
//     {
//       hashLock: Sdk.HashLock.forSingleFill(secret),
//       timeLocks: Sdk.TimeLocks.new({
//         srcWithdrawal: 10n, // 10sec finality lock for test
//         srcPublicWithdrawal: 120n, // 2m for private withdrawal
//         srcCancellation: 121n, // 1sec public withdrawal
//         srcPublicCancellation: 122n, // 1sec private cancellation
//         dstWithdrawal: 10n, // 10sec finality lock for test
//         dstPublicWithdrawal: 100n, // 100sec private withdrawal
//         dstCancellation: 101n, // 1sec public withdrawal
//       }),
//       srcChainId: Sdk.NetworkEnum.ETHEREUMSEPOLIA,
//       dstChainId: Sdk.NetworkEnum.ETHEREUM,
//       srcSafetyDeposit: parseEther("0.001"),
//       dstSafetyDeposit: parseEther("0.001"),
//     },
//     {
//       auction: new Sdk.AuctionDetails({
//         initialRateBump: 0,
//         points: [],
//         duration: 120n,
//         startTime: srcTimestamp,
//       }),
//       whitelist: [
//         {
//           address: new Sdk.Address(resolverContractAddress),
//           allowFrom: 0n,
//         },
//       ],
//       resolvingStartTime: 0n,
//     },
//     {
//       nonce: Sdk.randBigInt(UINT_40_MAX),
//       allowPartialFills: false,
//       allowMultipleFills: false,
//     },
//   );

//   // console.log("Order Created");
//   // console.log(order);

//   const typedData = order.getTypedData(sepolia.id);

//   console.log("Typed Data", typedData);

//   const sourceChainJsonProvider = new JsonRpcProvider(
//     "https://eth-sepolia.g.alchemy.com/v2/GjY-dhCmevGOkXFtA_7Y59XF086X-4OR",
//     sepolia.id,
//   );
//   const makerWallet = new PKWallet(
//     makerPrivateKey as `0x${string}`,
//     sourceChainJsonProvider,
//   );

//   const makerSignature = await makerWallet.signTypedData(
//     typedData.domain,
//     { Order: typedData.types[typedData.primaryType] },
//     typedData.message,
//   );

//   console.log("Signature", makerSignature);

//   const orderHash = order.getOrderHash(sepolia.id);

//   console.log("Order Hash", orderHash);

//   // Approve USDC to Limit Order Contract
//   // const tx = await makerWallet.sendTransaction({
//   //         to: sepoliaUSDCContract.toString(),
//   //         data: '0x095ea7b3' + coder.encode(['address', 'uint256'], [sepoliaLimitOrderContract.toString(), 100000]).slice(2)
//   //     })

//   // await tx.wait()

//   // console.log("Transaction Hash", tx.hash);

//   // const resolverContract = new

//   const fillAmount = order.makingAmount;
//   const deployResponse = deploySrc(
//     sepolia.id,
//     order,
//     makerSignature,
//     Sdk.TakerTraits.default()
//       .setExtension(order.extension)
//       .setAmountMode(Sdk.AmountMode.maker)
//       .setAmountThreshold(order.takingAmount),
//     fillAmount,
//   );

//   console.log("Deploy Response", deployResponse);

//   console.log("Sending Transaction");

//   const takerWallet = new PKWallet(
//     takerPrivateKey as `0x${string}`,
//     sourceChainJsonProvider,
//   );

//   console.log("Taker Wallet", takerWallet.getAddress());
//   send(deployResponse, takerWallet);
// }

async function send(param: TransactionRequest, signer: Signer) {
  try {
    const tx = await signer.sendTransaction({
      ...param,
      gasLimit: 10_000_000,
      from: signer.getAddress(),
    });
    const receipt = await tx.wait(1);
    console.log("Transaction Receipt", receipt);
  } catch (error) {
    console.error("Transaction error:", error);
    //  console.error("Error code:", error.code);
    // console.error("Error message:", error.message);
  }
}

// // Start the loop
startResolver().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
