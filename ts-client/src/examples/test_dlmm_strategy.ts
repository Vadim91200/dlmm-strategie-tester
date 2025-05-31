import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import DLMM, {LbPosition } from '@meteora-ag/dlmm'
import { BN } from "@coral-xyz/anchor";
import { getMint, Mint } from "@solana/spl-token";
import * as readline from 'readline';

require('dotenv').config();


async function initializeClient(): Promise<{ connection: Connection; dlmm: DLMM }> {
  const RPC = "https://neat-magical-market.solana-mainnet.quiknode.pro/22f4786138ebd920140d051f0ebdc6da71f058db/";
  const poolAddress = new PublicKey("5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6");
  const connection = new Connection(RPC, "finalized");
  const dlmm = await DLMM.create(connection, poolAddress, {
    cluster: "mainnet-beta",
  });
  return { connection, dlmm };
}

function getUserKeypair(): Keypair {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY not found in environment variables");
  }
  const privateKeyArray = JSON.parse(PRIVATE_KEY);
  const privateKeyBytes = new Uint8Array(privateKeyArray);
  return Keypair.fromSecretKey(privateKeyBytes);
}

async function initializePosition(dlmm: DLMM,  user: Keypair,  newOneSidePosition: Keypair, connection: Connection): Promise<void> {
  const totalIntervalRange = 10;
  const activeBin = await dlmm.getActiveBin();
  const maxBinId = activeBin.binId + totalIntervalRange;
  const minBinId = activeBin.binId - totalIntervalRange;
  const totalXAmount = new BN(0);
  const totalYAmount = new BN(100 * 10 ** 6);

  // Create Position
  const createPositionTx =
  await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: newOneSidePosition.publicKey,
    user: user.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      maxBinId,
      minBinId,
      strategyType: 0, // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
    },
  });

try {
  const createOneSidePositionTxHash = await sendAndConfirmTransaction(
    connection,
    createPositionTx,
    [user, newOneSidePosition]
  );
  console.log(
    "🚀 ~ createOneSidePositionTxHash:",
    createOneSidePositionTxHash
  );
} catch (error) {
  console.log("🚀 ~ createOneSidePosition::error:", JSON.parse(JSON.stringify(error)));
}
}

async function addLiquidity(
  dlmm: DLMM,
  user: Keypair,
  newOneSidePosition: Keypair,
  connection: Connection
): Promise<void> {
  const totalIntervalRange = 10;
  const activeBin = await dlmm.getActiveBin();
  const maxBinId = activeBin.binId + totalIntervalRange;
  const minBinId = activeBin.binId - totalIntervalRange;
  const totalXAmount = new BN(0);
  const totalYAmount = new BN(100 * 10 ** 6);

  // Add Liquidity to existing position
    // Add Liquidity to existing position
    const addLiquidityTx = await dlmm.addLiquidityByStrategy({
      positionPubKey: newOneSidePosition.publicKey,
      user: user.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: 0, // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
      },
    });
  
    try {
      const addLiquidityTxHash = await sendAndConfirmTransaction(
        connection,
        addLiquidityTx,
        [user]
      );
      console.log("🚀 ~ addLiquidityTxHash:", addLiquidityTxHash);
    } catch (error) {
      console.log("🚀 ~ addLiquidityToExistingPosition::error:", JSON.parse(JSON.stringify(error)));
    }
  }

interface Positions {
  userPositions: LbPosition[];
}

async function removeLiquidity(
  dlmm: DLMM,
  user: Keypair,
  positions: Positions,
  connection: Connection
): Promise<void> {
  // Remove Liquidity
  const userPositions = positions.userPositions;
  const removeLiquidityTxs = (
    await Promise.all(
        userPositions.map((position) => {
            const binIdsToRemove = position.positionData.positionBinData.map(
                (bin) => bin.binId
            );
            return dlmm.removeLiquidity({
                position: position.publicKey,
                user: user.publicKey,
                fromBinId: binIdsToRemove[0],
                toBinId: binIdsToRemove[binIdsToRemove.length - 1],
                bps: new BN(100 * 100),
                shouldClaimAndClose: true,
            });
        })
    )
  ).flat();

try {
    for (let tx of removeLiquidityTxs) {
        const removeBalanceLiquidityTxHash = await sendAndConfirmTransaction(
            connection,
            tx,
            [user],
            { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        console.log(
            "🚀 ~ removeBalanceLiquidityTxHash:",
            removeBalanceLiquidityTxHash
        );
    }
} catch (error) {
    console.log("🚀 ~ removePositionLiquidity::error:", JSON.parse(JSON.stringify(error)));
}
}

async function swap(dlmm: DLMM, user: Keypair, connection: Connection): Promise<void> {
  const swapAmount = new BN(100);
  const swapYToX = true;
  const binArrays = await dlmm.getBinArrayForSwap(swapYToX);
  const swapQuote = await dlmm.swapQuote(swapAmount, swapYToX, new BN(1), binArrays);

  console.log("🚀 ~ swapQuote:", swapQuote);

    // Swap
    const swapTx = await dlmm.swap({
        inToken: dlmm.tokenX.publicKey,
        binArraysPubkey: swapQuote.binArraysPubkey,
        inAmount: swapAmount,
        lbPair: dlmm.pubkey,
        user: user.publicKey,
        minOutAmount: swapQuote.minOutAmount,
        outToken: dlmm.tokenY.publicKey,
    });

    try {
        const swapTxHash = await sendAndConfirmTransaction(connection, swapTx, [
            user,
        ]);
        console.log("🚀 ~ swapTxHash:", swapTxHash);
    } catch (error) {
        console.log("🚀 ~ swap::error:", JSON.parse(JSON.stringify(error)));
    }
}

async function displayPositions(dlmm: DLMM, user: Keypair): Promise<void> {
  const positions = await dlmm.getPositionsByUserAndLbPair(user.publicKey);
  const userPositions = positions.userPositions;

  if (userPositions.length === 0) {
      console.log("No active positions found.");
      return;
  }

  const activeBin = await dlmm.getActiveBin();
  const activeBinId = activeBin.binId;

  console.log("\nActive Positions:");
  console.log("-".repeat(50));
  console.log(`Current Active Bin ID: ${activeBinId}`);
  console.log("-".repeat(50));

  for (let i = 0; i < userPositions.length; i++) {
      const position = userPositions[i];
      const lowerBin = position.positionData.lowerBinId;
      const upperBin = position.positionData.upperBinId;

      const isInRange = lowerBin <= activeBinId && activeBinId <= upperBin;
      const rangeStatus = isInRange ? "✅ IN RANGE" : "❌ OUT OF RANGE";

      console.log(`Position ${i + 1}:`);
      console.log(`Public Key: ${position.publicKey.toString()}`);
      console.log(`Total X Amount: ${position.positionData.totalXAmount.toString()}`);
      console.log(`Total Y Amount: ${position.positionData.totalYAmount.toString()}`);
      console.log(`Number of Bins: ${position.positionData.positionBinData.length}`);
      console.log(`Lower Bin: ${lowerBin}`);
      console.log(`Upper Bin: ${upperBin}`);
      console.log(`Status: ${rangeStatus}`);
      
      if (!isInRange) {
          if (activeBinId < lowerBin) {
              console.log(`Position is ${lowerBin - activeBinId} bins below current range`);
          } else {
              console.log(`Position is ${activeBinId - upperBin} bins above current range`);
          }
      }
      console.log("-".repeat(50));
  }
}

async function main(): Promise<void> {
  const { connection, dlmm } = await initializeClient();
  const user = getUserKeypair();
  const newOnesidePosition = Keypair.generate();

  while (true) {
      console.log("\nMenu:");
      console.log("1. Initialize Position");
      console.log("2. Add Liquidity");
      console.log("3. Remove Liquidity");
      console.log("4. Swap");
      console.log("5. Display Active Positions");
      console.log("6. Exit");

      const choice = await new Promise<string>((resolve) => {
          process.stdin.once('data', (data) => {
              resolve(data.toString().trim());
          });
      });

      switch (choice) {
          case '1':
              await initializePosition(dlmm, user, newOnesidePosition, connection);
              break;
          case '2':
              const positions2 = await dlmm.getPositionsByUserAndLbPair(user.publicKey);
              await addLiquidity(dlmm, user, newOnesidePosition, connection);
              break;
          case '3':
              const positions3 = await dlmm.getPositionsByUserAndLbPair(user.publicKey);
              await removeLiquidity(dlmm, user, positions3, connection);
              break;
          case '4':
              await swap(dlmm, user, connection);
              break;
          case '5':
              await displayPositions(dlmm, user);
              break;
          case '6':
              process.exit(0);
          default:
              console.log("Invalid choice. Please try again.");
      }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export {
  initializeClient,
  getUserKeypair,
  initializePosition,
  addLiquidity,
  removeLiquidity,
  swap,
  displayPositions,
  main
}; 