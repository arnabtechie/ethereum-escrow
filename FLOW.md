# Escrow Platform Flow Documentation

## Overview

This document explains the complete flow of the Ethereum Escrow Platform with time-based vesting mechanism. This is a **Proof of Concept (POC)** implementation.

## Example Setup

- **Total Amount**: 1 ETH
- **Vesting**: 70% (0.7 ETH time-based, 0.3 ETH completion)
- **Duration**: 60 minutes total
- **Interval**: 10 minutes (6 intervals total)
- **Client**: Tech Venture
- **Provider**: Rohit

---

## Step-by-Step Flow

### Step 1: Create Escrow

**Explanation**: Tech Venture creates an escrow for Rohit with 1 ETH, 70% vesting, 60 minutes total duration, and 10-minute intervals. The contract calculates 0.7 ETH for time-based vesting and 0.3 ETH for completion bonus. Status: CREATED.

**Logic**: Contract initializes with client address, provider address, total amount, vesting percentage, total duration, and interval duration. Calculates timeBasedAmount and completionBasedAmount. Sets startTime and originalEndTime.

---

### Step 2: Deposit Funds

**Explanation**: Tech Venture deposits exactly 1 ETH into the contract. The contract validates the amount matches the total amount. Status changes to: FUNDED.

**Logic**: Contract validates status is CREATED and msg.value equals totalAmount. Updates status to FUNDED and emits FundsDeposited event.

---

### Step 3: Vesting Calculation (20 Minutes)

**Explanation**: After 20 minutes have passed, Rohit checks available payout. Based on elapsed time (2 intervals out of 6), 0.2333 ETH is vested and available for claim.

**Logic**: Contract calculates elapsed intervals: elapsedSeconds = 1200, intervalsElapsed = 2. Vested amount = (0.7 × 2) ÷ 6 = 0.2333 ETH.

---

### Step 4: Provider Claims First Payout

**Explanation**: Rohit claims payout after 20 minutes. The contract transfers 0.2333 ETH to Rohit. Released amount is updated to 0.2333 ETH.

**Logic**: Contract calculates available payout = 0.2333 ETH. Transfers to provider address. Updates releasedAmount. Emits ProviderPaid event.

---

### Step 5: Vesting Calculation (50 Minutes)

**Explanation**: After 50 minutes total have elapsed, Rohit checks again. More time has passed (5 intervals), so additional 0.35 ETH is now available for claim.

**Logic**: Contract calculates: intervalsElapsed = 5, vestedAmount = (0.7 × 5) ÷ 6 = 0.5833 ETH. Available = 0.5833 - 0.2333 = 0.35 ETH.

---

### Step 6: Dispute Raised

**Explanation**: Tech Venture raises a dispute at 40 minutes due to quality concerns. Vesting pauses (time stops counting until resolved).

**Logic**: Contract sets isDisputed = true. Either party can raise disputes. Vesting calculation uses time before dispute was raised.

---

### Step 7: Resolve Dispute

**Explanation**: Tech Venture resolves the dispute and adds 20 minutes for Rohit to fix issues. Vesting resumes with the new extended end time.

**Logic**: Contract sets isDisputed = false. If additionalMinutes > 0, extends endTime. Updates extendedEndTime. Vesting resumes with new deadline.

---

### Step 8: Provider Claims Second Payout

**Explanation**: Rohit claims payout after dispute resolution. The contract transfers additional vested amount to Rohit based on elapsed time.

**Logic**: Contract calculates current vested amount. Subtracts already released amount. Transfers difference to provider.

---

### Step 9: Client Approves Completion

**Explanation**: Tech Venture approves work completion. The completion bonus (0.3 ETH) becomes available for the provider to claim.

**Logic**: Contract sets completionApproved = true and status = COMPLETED. Completion bonus is now included in provider's entitled amount.

---

### Step 10: Provider Claims Completion Bonus

**Explanation**: Rohit claims final payout including completion bonus. The contract transfers remaining 0.4167 ETH to Rohit. All funds are released. Status: CLOSED.

**Logic**: Contract calculates: entitled = 0.7 ETH (full vesting) + 0.3 ETH (bonus) = 1.0 ETH. Available = 1.0 - 0.5833 = 0.4167 ETH. Transfers to provider. Auto-closes escrow when releasedAmount + refundedAmount = totalAmount.

---

## Alternative: Refund Flow

### Step 11: Client Claims Partial Refund

**Explanation**: Tech Venture claims 0.2 ETH refund at 40 minutes. The contract transfers 0.2 ETH to Tech Venture. Refunded amount is updated to 0.2 ETH.

**Logic**: Contract validates: maxRefund = totalAmount - releasedAmount - refundedAmount. Checks amount ≤ maxRefund. Transfers to client. Updates refundedAmount.

---

### Step 12: Provider Claims After Refund

**Explanation**: Rohit claims remaining vested amount. The contract transfers 0.1167 ETH to Rohit based on his entitled amount.

**Logic**: Contract calculates provider's entitled amount. Subtracts already released. Transfers available amount to provider.

---

### Step 13: Final Closure

**Explanation**: Tech Venture claims remaining 0.1 ETH. The contract transfers to Tech Venture. All funds are distributed. Status: CLOSED.

**Logic**: Contract validates remaining balance. Transfers to client. Checks if releasedAmount + refundedAmount = totalAmount. Sets status to CLOSED.

---

## Key Features

### Time-Based Vesting

- Funds are released incrementally based on elapsed time intervals
- Provider can claim vested amounts multiple times as time passes
- Vesting calculation: `(timeBasedAmount × elapsedIntervals) ÷ totalIntervals`

### Dispute Resolution

- Either party can raise disputes during FUNDED state
- Disputes pause vesting time calculation
- Client can resolve disputes with optional time extensions
- Vesting resumes after resolution

### Flexible Settlements

- Provider can claim payouts at any time (even if disputed or closed)
- Client can claim refunds (full or partial) at any time
- Both actions work independently
- Escrow auto-closes when all funds are distributed

### Completion Bonus

- Settlement portion (e.g., 30%) is released only after client approval
- Provider receives completion bonus after client calls approveCompletion()
- Completion bonus is added to total entitled amount

---

## State Machine

```
CREATED → FUNDED → COMPLETED → CLOSED
         ↓
      DISPUTED → RESOLVED (with optional time extension)
```

**Status Transitions:**
- CREATED: Contract deployed, waiting for deposit
- FUNDED: Funds deposited, vesting active
- COMPLETED: Client approved completion
- CLOSED: All funds distributed (releasedAmount + refundedAmount = totalAmount)
- DISPUTED: Dispute raised (can occur during FUNDED state)

---

## Important Notes

1. **Vesting Calculation**: Uses interval-based calculation, not continuous time
2. **Incremental Claims**: Provider can claim multiple times as vesting increases
3. **Dispute Handling**: Disputes pause vesting; resolution can extend time
4. **Flexible Refunds**: Client can claim full or partial refunds anytime
5. **Independent Actions**: Payouts and refunds work independently
6. **Auto-Closure**: Escrow closes automatically when funds are fully distributed
7. **Early Closure**: Both parties can claim funds before scheduled end, permanently closing escrow

---

## POC Limitations

This is a proof of concept with the following limitations:

- Simplified dispute resolution
- Basic error handling
- No multi-signature support
- No advanced access control
- Limited security features
- Basic monitoring
- Testnet only (Sepolia)

**For production use, additional features and security measures are required.**
