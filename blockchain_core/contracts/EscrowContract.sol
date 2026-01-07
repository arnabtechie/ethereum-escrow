// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EscrowVesting {
    enum Status {
        CREATED,
        FUNDED,
        COMPLETED,
        CLOSED
    }

    address public immutable client;
    address public immutable serviceProvider;

    uint256 public immutable totalAmount;
    uint256 public immutable startTime;

    uint256 public immutable totalDurationSeconds;
    uint256 public immutable intervalSeconds;
    uint256 public immutable totalIntervals;

    uint256 public immutable originalEndTime;
    uint256 private extendedEndTime;

    uint256 private immutable timeBasedAmount;
    uint256 private immutable completionBasedAmount;

    uint256 public releasedAmount;
    uint256 public refundedAmount;

    bool public completionApproved;
    bool public isDisputed;
    Status public status;

    event EscrowCreated(address client, address provider, uint256 amount);
    event FundsDeposited(uint256 amount);
    event DisputeRaised(address by);
    event DisputeResolved(uint256 effectiveEndTime);
    event CompletionApproved();
    event ProviderPaid(uint256 amount);
    event ClientRefunded(uint256 amount);
    event EscrowClosed();

    modifier onlyClient() {
        require(msg.sender == client, "Only client");
        _;
    }

    modifier onlyProvider() {
        require(msg.sender == serviceProvider, "Only provider");
        _;
    }

    modifier notDisputed() {
        require(!isDisputed, "Escrow in dispute");
        _;
    }

    modifier disputed() {
        require(isDisputed, "Escrow not in dispute");
        _;
    }
    constructor(
        address _client,
        address _serviceProvider,
        uint256 _totalAmount,
        uint256 vestedPercentage,
        uint256 totalMinutes,
        uint256 intervalMinutes
    ) {
        require(_client != address(0), "Invalid client");
        require(_serviceProvider != address(0), "Invalid provider");
        require(_totalAmount > 0, "Invalid amount");
        require(vestedPercentage <= 90, "Invalid vesting %");
        require(totalMinutes > 0, "Invalid duration");
        require(intervalMinutes > 0, "Invalid interval");
        require(
            totalMinutes % intervalMinutes == 0,
            "Duration must be divisible by interval"
        );
        require(
            totalMinutes % intervalMinutes == 0,
            "Duration must be divisible by interval"
        );

        client = _client;
        serviceProvider = _serviceProvider;
        totalAmount = _totalAmount;

        timeBasedAmount = (_totalAmount * vestedPercentage) / 100;
        completionBasedAmount = _totalAmount - timeBasedAmount;

        totalDurationSeconds = totalMinutes * 60;
        intervalSeconds = intervalMinutes * 60;
        totalIntervals = totalDurationSeconds / intervalSeconds;

        startTime = block.timestamp;
        originalEndTime = startTime + totalDurationSeconds;

        status = Status.CREATED;

        emit EscrowCreated(client, serviceProvider, totalAmount);
    }

    function deposit() external payable onlyClient {
        require(status == Status.CREATED, "Already funded");
        require(msg.value == totalAmount, "Incorrect amount");

        status = Status.FUNDED;
        emit FundsDeposited(msg.value);
    }

    function raiseDispute() external {
        require(
            msg.sender == client || msg.sender == serviceProvider,
            "Unauthorized"
        );
        require(status == Status.FUNDED, "Invalid state");
        require(!isDisputed, "Already disputed");

        isDisputed = true;
        emit DisputeRaised(msg.sender);
    }

    function effectiveEndTime() public view returns (uint256) {
        return extendedEndTime != 0 ? extendedEndTime : originalEndTime;
    }

    function resolveDispute(
        uint256 additionalMinutes
    ) external onlyClient disputed {
        isDisputed = false;

        if (additionalMinutes > 0) {
            uint256 newEnd = effectiveEndTime() + (additionalMinutes * 60);
            require(newEnd > effectiveEndTime(), "Invalid extension");
            extendedEndTime = newEnd;
        }

        emit DisputeResolved(effectiveEndTime());
    }

    function approveCompletion() external onlyClient notDisputed {
        require(status == Status.FUNDED, "Escrow not funded");
        require(!completionApproved, "Already approved");

        completionApproved = true;
        status = Status.COMPLETED;

        emit CompletionApproved();
    }

    function _elapsedIntervals() internal view returns (uint256) {
        uint256 elapsedSeconds = block.timestamp > effectiveEndTime()
            ? totalDurationSeconds
            : block.timestamp - startTime;

        uint256 intervals = elapsedSeconds / intervalSeconds;
        return intervals > totalIntervals ? totalIntervals : intervals;
    }

    function _vestedAmountByTime() internal view returns (uint256) {
        uint256 intervalsElapsed = _elapsedIntervals();
        return (timeBasedAmount * intervalsElapsed) / totalIntervals;
    }

    function getEstimatedProviderPayout() public view returns (uint256) {
        uint256 entitled = _vestedAmountByTime();

        if (completionApproved) {
            entitled += completionBasedAmount;
        }

        return entitled > releasedAmount ? entitled - releasedAmount : 0;
    }

    function getEstimatedClientRefund() public view returns (uint256) {
        uint256 remaining = totalAmount - releasedAmount - refundedAmount;
        uint256 providerEntitled = getEstimatedProviderPayout();

        return remaining > providerEntitled ? remaining - providerEntitled : 0;
    }

    function getMaxClientRefund() public view returns (uint256) {
        return totalAmount - releasedAmount - refundedAmount;
    }

    function claimProviderPayout() external onlyProvider {
        uint256 payout = getEstimatedProviderPayout();
        require(payout > 0, "Nothing to claim");

        releasedAmount += payout;
        (bool ok, ) = serviceProvider.call{value: payout}("");
        require(ok, "ETH transfer failed");

        emit ProviderPaid(payout);
        _checkClose();
    }

    function claimClientRefund(uint256 amount) external onlyClient {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 maxRefund = getMaxClientRefund();
        require(amount <= maxRefund, "Refund exceeds available balance");

        refundedAmount += amount;
        (bool ok, ) = client.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit ClientRefunded(amount);
        _checkClose();
    }

    function _checkClose() internal {
        if (releasedAmount + refundedAmount == totalAmount) {
            status = Status.CLOSED;
            emit EscrowClosed();
        }
    }
}
