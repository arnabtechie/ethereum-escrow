const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EscrowVesting", function () {
  let escrow;
  let client;
  let serviceProvider;
  let otherAccount;
  const totalAmount = ethers.parseEther("1.0");
  const vestedPercentage = 70;
  const totalMinutes = 60;
  const intervalMinutes = 10;

  beforeEach(async function () {
    [client, serviceProvider, otherAccount] = await ethers.getSigners();

    const EscrowVesting = await ethers.getContractFactory("EscrowVesting");
    escrow = await EscrowVesting.deploy(
      serviceProvider.address,
      totalAmount,
      vestedPercentage,
      totalMinutes,
      intervalMinutes
    );
  });

  describe("Deployment", function () {
    it("Should set the right client and service provider", async function () {
      expect(await escrow.client()).to.equal(client.address);
      expect(await escrow.serviceProvider()).to.equal(serviceProvider.address);
    });

    it("Should set the correct total amount", async function () {
      expect(await escrow.totalAmount()).to.equal(totalAmount);
    });

    it("Should initialize with CREATED status", async function () {
      expect(await escrow.status()).to.equal(0); // CREATED = 0
    });
  });

  describe("Deposit", function () {
    it("Should allow client to deposit funds", async function () {
      await expect(escrow.connect(client).deposit({ value: totalAmount }))
        .to.emit(escrow, "FundsDeposited")
        .withArgs(totalAmount);

      expect(await escrow.status()).to.equal(1); // FUNDED = 1
    });

    it("Should reject incorrect deposit amount", async function () {
      await expect(
        escrow.connect(client).deposit({ value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect amount");
    });

    it("Should reject deposit from non-client", async function () {
      await expect(
        escrow.connect(otherAccount).deposit({ value: totalAmount })
      ).to.be.revertedWith("Only client");
    });
  });

  describe("Dispute", function () {
    beforeEach(async function () {
      await escrow.connect(client).deposit({ value: totalAmount });
    });

    it("Should allow client to raise dispute", async function () {
      await expect(escrow.connect(client).raiseDispute())
        .to.emit(escrow, "DisputeRaised")
        .withArgs(client.address);

      expect(await escrow.isDisputed()).to.be.true;
    });

    it("Should allow service provider to raise dispute", async function () {
      await expect(escrow.connect(serviceProvider).raiseDispute())
        .to.emit(escrow, "DisputeRaised")
        .withArgs(serviceProvider.address);
    });
  });

  describe("Completion Approval", function () {
    beforeEach(async function () {
      await escrow.connect(client).deposit({ value: totalAmount });
    });

    it("Should allow client to approve completion", async function () {
      await expect(escrow.connect(client).approveCompletion())
        .to.emit(escrow, "CompletionApproved");

      expect(await escrow.completionApproved()).to.be.true;
      expect(await escrow.status()).to.equal(2); // COMPLETED = 2
    });
  });
});

