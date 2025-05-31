from dlmm import DLMM_CLIENT
from dlmm.dlmm import DLMM
from dlmm.types import GetPositionByUser, StrategyType, SwapQuote
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.api import Client
from solana.transaction import Transaction
from dotenv import load_dotenv
import os
import ast
import time

load_dotenv()

def initialize_client():
    RPC = "https://neat-magical-market.solana-mainnet.quiknode.pro/22f4786138ebd920140d051f0ebdc6da71f058db/"
    pool_address = Pubkey.from_string("5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6")
    client = Client(RPC)
    dlmm = DLMM_CLIENT.create(pool_address, RPC)
    assert isinstance(dlmm, DLMM)
    return client, dlmm

def get_user_keypair():
    PRIVATE_KEY = os.getenv('PRIVATE_KEY')
    private_key_list = ast.literal_eval(PRIVATE_KEY)
    private_key_bytes = bytes(private_key_list)
    user = Keypair.from_bytes(private_key_bytes)
    return user

def initialize_position(dlmm, user, new_oneside_position, client):
    total_interval_range = 10
    active_bin = dlmm.get_active_bin()
    max_bin_id = active_bin.bin_id + total_interval_range
    min_bin_id = active_bin.bin_id - total_interval_range
    total_x_amount = 0
    total_y_amount = 100 * 10 ** 6

    position_tx = dlmm.initialize_position_and_add_liquidity_by_strategy(
        new_oneside_position.pubkey(),
        user.pubkey(),
        total_x_amount,
        total_y_amount,
        {
            "max_bin_id": max_bin_id,
            "min_bin_id": min_bin_id,
            "strategy_type": StrategyType.SpotOneSide
        })
    try:    
        assert isinstance(position_tx, Transaction)
        create_one_side_position_tx_hash = client.send_transaction(position_tx, user, new_oneside_position)
        print("🚀 ~ createOneSidePositionTxHash:", create_one_side_position_tx_hash.value)
    except Exception as error:
        print("🚀 ~ createOneSidePosition::error:", error.args[0].data.logs)
    

def add_liquidity(dlmm, user, new_oneside_position, client):
    total_interval_range = 10
    active_bin = dlmm.get_active_bin()
    max_bin_id = active_bin.bin_id + total_interval_range
    min_bin_id = active_bin.bin_id - total_interval_range
    total_x_amount = 0
    total_y_amount = 100 * 10 ** 6

    add_liquidity_tx = dlmm.add_liquidity_by_strategy(
        new_oneside_position.pubkey(),
        user.pubkey(),
        total_x_amount,
        total_y_amount,
        {
            "max_bin_id": max_bin_id,
            "min_bin_id": min_bin_id,
            "strategy_type": StrategyType.SpotOneSide
        })
    try:
        assert isinstance(add_liquidity_tx, Transaction)
        add_liquidity_tx_hash = client.send_transaction(add_liquidity_tx, user)
        print("🚀 ~ addLiquidityTxHash:", add_liquidity_tx_hash.value)
    except Exception as error:
        print("🚀 ~ addLiquidityToExistingPosition::error:", error.args[0].data.logs)

def remove_liquidity(dlmm, user, positions, client):
    user_positions = positions.user_positions
    if user_positions:
        for position in user_positions:
            remove_liquidity_transactions = dlmm.remove_liqidity(
                position.public_key,
                user.pubkey(),
                list(map(lambda bin: bin.bin_id, position.position_data.position_bin_data)),
                100 * 100,
                True
            )
            try:
                isinstance(remove_liquidity_transactions, list)
                for remove_balance_liquidity_tx in remove_liquidity_transactions:
                    remove_balance_liquidity_tx_hash = client.send_transaction(remove_balance_liquidity_tx, user)
                    print("🚀 ~ removeBalanceLiquidityTxHash:", remove_balance_liquidity_tx_hash.value)
            except Exception as error:
                print("🚀 ~ addLiquidityToExistingPosition::error:", error.args[0].data.logs)
def swap(dlmm, user, client):
    swap_amount = 100
    swap_y_to_x = True
    bin_arrays = dlmm.get_bin_array_for_swap(swap_y_to_x)
    swap_quote = dlmm.swap_quote(swap_amount, swap_y_to_x, 10, bin_arrays)
    assert isinstance(swap_quote, SwapQuote)

    swap_tx = dlmm.swap(
        dlmm.token_X.public_key,
        dlmm.token_Y.public_key,
        swap_amount,
        swap_quote.min_out_amount,
        dlmm.pool_address,
        user.pubkey(),
        swap_quote.bin_arrays_pubkey
        )

    try:
        assert isinstance(swap_tx, Transaction)
        swap_tx_hash = client.send_transaction(swap_tx, user)
        print("🚀 ~ swapTxHash:", swap_tx_hash)
    except Exception as error:
        print("🚀 ~ swap::error:", error.args[0].data.logs)

def display_positions(dlmm, user):
    positions = dlmm.get_positions_by_user_and_lb_pair(user.pubkey())
    assert isinstance(positions, GetPositionByUser)
    user_positions = positions.user_positions
    
    if not user_positions:
        print("No active positions found.")
        return
    
    # Get the active bin of the pool
    active_bin = dlmm.get_active_bin()
    active_bin_id = active_bin.bin_id
    
    print("\nActive Positions:")
    print("-" * 50)
    print(f"Current Active Bin ID: {active_bin_id}")
    print("-" * 50)
    
    for i, position in enumerate(user_positions, 1):
        lower_bin = position.position_data.lower_bin_id
        upper_bin = position.position_data.upper_bin_id
        
        # Check if position is within active range
        is_in_range = lower_bin <= active_bin_id <= upper_bin
        range_status = "✅ IN RANGE" if is_in_range else "❌ OUT OF RANGE"
        
        print(f"Position {i}:")
        print(f"Public Key: {position.public_key}")
        print(f"Total X Amount: {position.position_data.total_x_amount}")
        print(f"Total Y Amount: {position.position_data.total_y_amount}")
        print(f"Number of Bins: {len(position.position_data.position_bin_data)}")
        print(f"Lower Bin: {lower_bin}")
        print(f"Upper Bin: {upper_bin}")
        print(f"Status: {range_status}")
        if not is_in_range:
            if active_bin_id < lower_bin:
                print(f"Position is {active_bin_id - lower_bin} bins below current range")
            else:
                print(f"Position is {upper_bin - active_bin_id} bins above current range")
        print("-" * 50)

def main():
    client, dlmm = initialize_client()
    user = get_user_keypair()
    new_oneside_position = Keypair()
    while True:
        print("\nMenu:")
        print("1. Initialize Position")
        print("2. Add Liquidity")
        print("3. Remove Liquidity")
        print("4. Swap")
        print("5. Display Active Positions")
        print("6. Exit")
        choice = input("Enter your choice: ")

        if choice == '1':
            initialize_position(dlmm, user, new_oneside_position, client)

        elif choice == '2':
            positions = dlmm.get_positions_by_user_and_lb_pair(user.pubkey())
            assert isinstance(positions, GetPositionByUser)
            add_liquidity(dlmm, user, new_oneside_position, client)

        elif choice == '3':
            positions = dlmm.get_positions_by_user_and_lb_pair(user.pubkey())
            assert isinstance(positions, GetPositionByUser)
            remove_liquidity(dlmm, user, positions, client)

        elif choice == '4':
            swap(dlmm, user, client)
            
        elif choice == '5':
            display_positions(dlmm, user)
            
        elif choice == '6':
            break

        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main()