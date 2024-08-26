import 'dotenv/config';
import { Blockchain, SandboxContract, TreasuryContract, Verbosity, internal } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, SendMode } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMinterStaking, jettonContentToCell } from '../wrappers/JettonMinterStaking';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

//jetton params
let min_tons_for_storage = 10000000n;

describe('JettonMinterStaking', () => {
  let wallet_code: Cell;
  let minter_code: Cell;
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let notDeployer: SandboxContract<TreasuryContract>;
  let jettonMinter: SandboxContract<JettonMinterStaking>;
  let userWallet: any;
  let content: Cell;
  let state: number;
  let price: bigint;
  let cap: bigint;
  let withdraw_minimum: bigint;
  let Staking_start_date: number;
  let Staking_end_date: number;

  beforeAll(async () => {
    minter_code = await compile('JettonMinterStaking');
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    notDeployer = await blockchain.treasury('notDeployer');
    content = jettonContentToCell({
      type: 1,
      uri: process.env.JETTON_CONTENT_URI ? process.env.JETTON_CONTENT_URI : '',
    });
    wallet_code = await compile('JettonWallet');
    state = process.env.JETTON_STATE ? Number(process.env.JETTON_STATE).valueOf() : 0;
    price = process.env.JETTON_PRICE ? BigInt(process.env.JETTON_PRICE).valueOf() : BigInt(1000000000);
    cap = process.env.JETTON_CAP ? BigInt(process.env.JETTON_CAP).valueOf() : BigInt(1000000000);
    withdraw_minimum = process.env.WITHDRAW_MINIMUM
      ? BigInt(process.env.WITHDRAW_MINIMUM).valueOf()
      : BigInt(1000000000);
    Staking_start_date = process.env.JETTON_Staking_START_DATE
      ? Number(process.env.JETTON_Staking_START_DATE).valueOf()
      : 0;
    Staking_end_date = process.env.JETTON_Staking_END_DATE ? Number(process.env.JETTON_Staking_END_DATE).valueOf() : 0;

    jettonMinter = blockchain.openContract(
      JettonMinterStaking.createFromConfig(
        {
          admin: deployer.address,
          state,
          content,
          wallet_code,
          price: price as bigint,
        },
        minter_code,
      ),
    );
    userWallet = async (address: Address) =>
      blockchain.openContract(JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)));
  });

  // implementation detail
  it('should deploy', async () => {
    const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      deploy: true,
    });
  });
  // implementation detail
  it('check that all Staking parameters are ok', async () => {
    expect(await jettonMinter.getStakingState()).toEqual(Boolean(state));
    expect(await jettonMinter.getStakingPrice()).toEqual(price);
    expect(await jettonMinter.getStakingWithdrawMinimum()).toEqual(withdraw_minimum);
  });
  // implementation detail
  it('minter admin can change state', async () => {
    let changeState = await jettonMinter.sendChangeState(deployer.getSender(), true);
    expect(await jettonMinter.getStakingState()).toBe(true);
    changeState = await jettonMinter.sendChangeState(deployer.getSender(), false);
    expect(await jettonMinter.getStakingState()).toBe(false);
  });
  it('not a minter admin can not change state', async () => {
    let changeState = await jettonMinter.sendChangeState(notDeployer.getSender(), true);
    expect(await jettonMinter.getStakingState()).toBe(false);
    expect(changeState.transactions).toHaveTransaction({
      from: notDeployer.address,
      to: jettonMinter.address,
      aborted: true,
      exitCode: 77, // error::unauthorized_change_content_request
    });
  });
  // implementation detail
  it('not a minter admin can not withdraw', async () => {
    let withdraw = await jettonMinter.sendWithdraw(notDeployer.getSender());
    expect(withdraw.transactions).toHaveTransaction({
      from: notDeployer.address,
      to: jettonMinter.address,
      aborted: true,
      exitCode: 78, // error::unauthorized_withdraw_request
    });
  });
  it('minter admin can withdraw excess', async () => {
    await deployer.send({ value: toNano('1'), bounce: false, to: jettonMinter.address });
    let initialBalance = (await blockchain.getContract(deployer.address)).balance;
    let initialJettonMinterBalance = (await blockchain.getContract(jettonMinter.address)).balance;
    const withdrawResult = await jettonMinter.sendWithdraw(deployer.getSender());
    expect(withdrawResult.transactions).toHaveTransaction({
      //excesses
      from: jettonMinter.address,
      to: deployer.address,
    });
    let finalBalance = (await blockchain.getContract(deployer.address)).balance;
    let finalJettonMinterBalance = (await blockchain.getContract(jettonMinter.address)).balance;
    expect(finalJettonMinterBalance).toEqual(min_tons_for_storage);
    expect(finalBalance - initialBalance).toBeGreaterThan(toNano('0.99'));
  });
  it('minter admin can withdraw, but nothing yet', async () => {
    let tonBalanceInitial = (await blockchain.getContract(jettonMinter.address)).balance;
    await jettonMinter.sendWithdraw(deployer.getSender());
    let tonBalance = (await blockchain.getContract(jettonMinter.address)).balance;
    expect(tonBalanceInitial).toEqual(tonBalance);
  });
  // implementation detail
  it('check the jetton amount estimation based on TON amount', async () => {
    let jettonAmount = await jettonMinter.getInJettonAmount(toNano('1'));
    expect(jettonAmount).toEqual(((toNano('1') - min_tons_for_storage) * price) / toNano('1'));
    jettonAmount = await jettonMinter.getInJettonAmount(toNano('2'));
    expect(jettonAmount).toEqual(((toNano('2') - min_tons_for_storage) * price) / toNano('1'));
    jettonAmount = await jettonMinter.getInJettonAmount(toNano('0.1'));
    expect(jettonAmount).toEqual(((toNano('0.1') - min_tons_for_storage) * price) / toNano('1'));
    jettonAmount = await jettonMinter.getInJettonAmount(toNano('0.19999999'));
    expect(jettonAmount).toEqual(((toNano('0.19999999') - min_tons_for_storage) * price) / toNano('1'));
  });
  // implementation detail
  it('anyone can buy during Staking', async () => {
    await jettonMinter.sendBuy(notDeployer.getSender(), toNano('1'));
    const nonDeployerJettonWallet = await userWallet(notDeployer.address);
    expect(await nonDeployerJettonWallet.getJettonBalance()).toEqual(
      ((toNano('1') - min_tons_for_storage) * price) / toNano('1'),
    );
  });

  // implementation detail
  it('anyone can buy during Staking from 0.1 TON', async () => {
    let buyOn = toNano('0.1');
    await jettonMinter.sendBuy(notDeployer.getSender(), buyOn);
    const nonDeployerJettonWallet = await userWallet(notDeployer.address);
    const previousJettonBalance = ((toNano('1') - min_tons_for_storage) * price) / toNano('1');
    expect(await nonDeployerJettonWallet.getJettonBalance()).toEqual(
      previousJettonBalance + ((buyOn - min_tons_for_storage) * price) / toNano('1'),
    );
  });
  // implementation detail
  it('impossible to buy less than min amount', async () => {
    let buy = await jettonMinter.sendBuy(notDeployer.getSender(), min_tons_for_storage);
    expect(buy.transactions).toHaveTransaction({
      from: notDeployer.address,
      to: jettonMinter.address,
      aborted: true,
      exitCode: 79, // error::min_amount
    });
  });
  // implementation detail
  it('impossible to buy more than cap', async () => {
    let buy = await jettonMinter.sendBuy(notDeployer.getSender(), toNano(cap / price));
    expect(buy.transactions).toHaveTransaction({
      from: notDeployer.address,
      to: jettonMinter.address,
      aborted: true,
      exitCode: 80, // error::cap_exceeded
    });
  });
  // implementation detail
  it('impossible to buy before start, if it is not 0', async () => {
    if (Staking_start_date != 0) {
      let buy = await jettonMinter.sendBuy(notDeployer.getSender(), toNano('1'));
      expect(buy.transactions).toHaveTransaction({
        from: notDeployer.address,
        to: jettonMinter.address,
        aborted: true,
        exitCode: 81, // error::Staking_closed
      });
    }
  });
  // implementation detail
  it('impossible to buy after end, if it is not 0', async () => {
    if (Staking_end_date != 0) {
      let buy = await jettonMinter.sendBuy(notDeployer.getSender(), toNano('1'));
      expect(buy.transactions).toHaveTransaction({
        from: notDeployer.address,
        to: jettonMinter.address,
        aborted: true,
        exitCode: 82, // error::Staking_expired
      });
    }
  });
  // implementation detail
  it('impossible to buy if paused', async () => {
    await jettonMinter.sendChangeState(deployer.getSender(), true);
    let buy = await jettonMinter.sendBuy(notDeployer.getSender(), toNano('1'));
    expect(buy.transactions).toHaveTransaction({
      from: notDeployer.address,
      to: jettonMinter.address,
      aborted: true,
      exitCode: 83, // error::paused
    });
    await jettonMinter.sendChangeState(deployer.getSender(), false);
  });

  it('autowithdraw works normal', async () => {
    let buy = await jettonMinter.sendBuy(notDeployer.getSender(), toNano(10));
    expect(buy.transactions).toHaveTransaction({
      from: jettonMinter.address,
      to: deployer.address,
      aborted: false,
    });
  });
});
