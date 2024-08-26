import { compile, NetworkProvider, UIProvider } from '@ton/blueprint';
import { Address, beginCell, Cell, fromNano, OpenedContract, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { jettonContentToCell, JettonMinterStaking } from '../wrappers/JettonMinterStaking';
import { JettonWallet } from '../wrappers/JettonWallet';
import { promptAddress, promptAmount, promptBool, promptUrl, waitForTransaction } from '../wrappers/utils';

let minterStakingContract: OpenedContract<JettonMinterStaking>;
let jettonWallet: OpenedContract<JettonWallet>;

const adminActions = [
  'Mint',
  'Change admin',
  'Change content',
  'Change state',
  'Withdrawal',
  'Change price',
  'Change withdraw address',
  'Change minimum withdraw',
  'Set jetton wallet address',
];
const userActions = ['Stake', 'Info', 'Quit'];

const failedTransMessage = (ui: UIProvider) => {
  ui.write('Failed to get indication of transaction completion from API!\nCheck result manually, or try again\n');
};

// === === === Info Action === === ===
const infoAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const jettonData = await minterStakingContract.getJettonData();
  const StakingData = await minterStakingContract.getStakingData();
  ui.write('Jetton info:\n');
  ui.write(`Admin: ${jettonData.adminAddress}\n`);
  ui.write(`Total supply: ${fromNano(jettonData.totalSupply)}\n`);
  ui.write(`Mintable: ${jettonData.mintable}\n`);
  ui.write(`State: ${StakingData.state}\n`);
  ui.write(`Price: ${fromNano(StakingData.price)}\n`);
  // const inJettonBalance = await minterStakingContract.getIn

  const StakingWithdrawData = await minterStakingContract.getWithdrawData();
  ui.write('___________\nWithdraw info:\n');
  ui.write(`Withdraw address: ${StakingWithdrawData.withdrawAddress}\n`);
  ui.write(`Withdraw minimum: ${fromNano(StakingWithdrawData.minWithdraw)}\n`);

  ui.write('___________\nIn jetton info:\n');
  const in_jetton_info = await minterStakingContract.getInJettonInfo();
  ui.write(`In jetton minter address: ${in_jetton_info.jettonMinterAddress}\n`);
  ui.write(`In jetton wallet address: ${in_jetton_info.jettonWalletAddress}\n`);
  const jetton_wallet = provider.open(JettonWallet.createFromAddress(in_jetton_info.jettonWalletAddress));
  const jetton_balance = await jetton_wallet.getJettonBalance();
  ui.write(`In jetton balance: ${fromNano(jetton_balance)}\n`);
};
// === === end Info Action === === ===

// === === === Change Admin Action === === ===
const changeAdminAction = async (provider: NetworkProvider, ui: UIProvider) => {
  let retry: boolean;
  let newAdmin: Address;
  let curAdmin = await minterStakingContract.getAdminAddress();
  do {
    retry = false;
    newAdmin = await promptAddress('Please specify new admin address:', ui);
    if (newAdmin.equals(curAdmin)) {
      retry = true;
      ui.write('Address specified matched current admin address!\nPlease pick another one.\n');
    } else {
      ui.write(`New admin address is going to be: ${newAdmin}\nKindly double check it!\n`);
      retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
    }
  } while (retry);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  await minterStakingContract.sendChangeAdmin(provider.sender(), newAdmin);
  const transDone = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (transDone) {
    const adminAfter = await minterStakingContract.getAdminAddress();
    if (adminAfter.equals(newAdmin)) {
      ui.write('Admin changed successfully');
    } else {
      ui.write("Admin address hasn't changed!\nSomething went wrong!\n");
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Admin Action === === ===

// === === === Change Withdraw Address Action === === ===
const changeWithdrawAddressAction = async (provider: NetworkProvider, ui: UIProvider) => {
  let retry: boolean;
  let newWithdrawAddress: Address;
  let curWithdrawAddress = await minterStakingContract.getWithdrawAddress();
  do {
    retry = false;
    newWithdrawAddress = await promptAddress('Please specify new withdraw address:', ui);
    if (newWithdrawAddress.equals(curWithdrawAddress)) {
      retry = true;
      ui.write('Address specified matched current withdraw address!\nPlease pick another one.\n');
    } else {
      ui.write(`New withdraw address is going to be: ${newWithdrawAddress}\nKindly double check it!\n`);
      retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
    }
  } while (retry);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  await minterStakingContract.sendChangeWithdrawAddress(provider.sender(), newWithdrawAddress);
  const transDone = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (transDone) {
    const adminAfter = await minterStakingContract.getAdminAddress();
    if (adminAfter.equals(newWithdrawAddress)) {
      ui.write('Admin changed successfully');
    } else {
      ui.write("Admin address hasn't changed!\nSomething went wrong!\n");
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Withdraw Address Action === === ===

// === === === Change Content Action === === ===
const changeContentAction = async (provider: NetworkProvider, ui: UIProvider) => {
  let retry: boolean;
  let newContent: string;
  let curContent = await minterStakingContract.getContent();
  do {
    retry = false;
    newContent = await promptUrl('Please specify new content:', ui);
    if (curContent.equals(jettonContentToCell({ type: 1, uri: newContent }))) {
      retry = true;
      ui.write('URI specified matched current content!\nPlease pick another one.\n');
    } else {
      ui.write(`New content is going to be: ${newContent}\nKindly double check it!\n`);
      retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
    }
  } while (retry);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  await minterStakingContract.sendChangeContent(provider.sender(), jettonContentToCell({ type: 1, uri: newContent }));
  const transDone = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (transDone) {
    const contentAfter = await minterStakingContract.getContent();
    if (contentAfter.equals(jettonContentToCell({ type: 1, uri: newContent }))) {
      ui.write('Content changed successfully');
    } else {
      ui.write("Content hasn't changed!\nSomething went wrong!\n");
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Content Action === === ===

// === === === Change Staking State Action === === ===
const changeStateAction = async (provider: NetworkProvider, ui: UIProvider) => {
  let retry: boolean;
  let newStakingState: boolean;
  let curStakingState = await minterStakingContract.getStakingState();
  do {
    retry = false;
    newStakingState = await promptBool('Please specify new state, yes - pause, no - resume:', ['yes', 'no'], ui);
    if (curStakingState == newStakingState) {
      retry = true;
      ui.write('Staking state specified matched current state!\nPlease pick another one.\n');
    } else {
      ui.write(`New Staking state is going to be: ${newStakingState}\nKindly double check it!\n`);
      retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
    }
  } while (retry);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  await minterStakingContract.sendChangeState(provider.sender(), newStakingState);
  const transDone = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (transDone) {
    const stateAfter = await minterStakingContract.getStakingState();
    if (stateAfter == newStakingState) {
      ui.write('Staking state changed successfully');
    } else {
      ui.write("Staking state hasn't changed!\nSomething went wrong!\n");
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Staking State Action === === ===

// === === === Mint Action === === ===
const mintAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let mintAddress: Address;
  let mintAmount: string;
  let forwardAmount: string;

  do {
    retry = false;
    const fallbackAddr = sender.address ?? (await minterStakingContract.getAdminAddress());
    mintAddress = await promptAddress(`Please specify address to mint to`, ui, fallbackAddr);
    mintAmount = await promptAmount('Please provide mint amount in decimal form:', ui);
    ui.write(`Mint ${mintAmount} tokens to ${mintAddress}\n`);
    retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  } while (retry);

  ui.write(`Minting ${mintAmount} to ${mintAddress}\n`);
  const supplyBefore = await minterStakingContract.getTotalSupply();
  const nanoMint = toNano(mintAmount);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  const res = await minterStakingContract.sendMint(sender, mintAddress, nanoMint, toNano('0.05'), toNano('0.1'));
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const supplyAfter = await minterStakingContract.getTotalSupply();
    if (supplyAfter == supplyBefore + nanoMint) {
      ui.write('Mint successfull!\nCurrent supply:' + fromNano(supplyAfter));
    } else {
      ui.write('Mint failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Mint Action === === ===

// === === === Stake Action === === ===
const StakeAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let amountToBuy: string;

  do {
    retry = false;
    amountToBuy = await promptAmount('Please provide jetton amount in decimal form:', ui);
    ui.write(`Buying on ${amountToBuy}\n`);
    retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  } while (retry);

  if (!sender.address) throw 'Sender address is not defined';

  const inJettonInfo = await minterStakingContract.getInJettonInfo();

  const jettonMinter = provider.open(JettonMinter.createFromAddress(inJettonInfo.jettonMinterAddress));
  const jettonWalletAddress = await jettonMinter.getWalletAddress(sender.address);

  const supplyBefore = await minterStakingContract.getTotalSupply();
  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  jettonWallet = provider.open(JettonWallet.createFromAddress(jettonWalletAddress));

  const staking_cell = beginCell().storeAddress(sender.address).endCell();

  const res = await jettonWallet.sendTransfer(
    sender,
    toNano('0.25'),
    toNano(amountToBuy),
    minterStakingContract.address,
    minterStakingContract.address,
    Cell.EMPTY,
    toNano('0.2'),
    beginCell().storeUint(0xc89a3ee4, 32).endCell(),
  );
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const supplyAfter = await minterStakingContract.getTotalSupply();

    if (supplyAfter > supplyBefore) {
      ui.write('Staking successful!\nYou have received:' + fromNano(supplyAfter - supplyBefore));
    } else {
      ui.write('Staking failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Stake Action === === ===

// === === === Withdraw Action === === ===
const withdrawalAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let amountToWithdraw: string;

  do {
    retry = false;
    retry = !(await promptBool(
      'Is it ok to withdraw TON from staking on the admin wallet?(yes/no)',
      ['yes', 'no'],
      ui,
    ));
  } while (retry);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  const contractBalanceBefore = BigInt(
    (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account.balance.coins,
  );
  const inJettonWalletInfo = await minterStakingContract.getInJettonInfo();
  const jettonWallet = provider.open(JettonWallet.createFromAddress(inJettonWalletInfo.jettonWalletAddress));
  const jettonBalance = await jettonWallet.getJettonBalance();
  const knownJettonBalance = await minterStakingContract.getInJettonAmount();
  if (fromNano(jettonBalance) == '0') {
    ui.write('Current contract jetton balance is 0. There is nothing to withdraw!\n');
    return;
  }
  ui.write(`Current jetton wallet balance: ${fromNano(jettonBalance)}\n`);
  ui.write(`Current known jetton wallet balance: ${fromNano(knownJettonBalance)}\n`);
  do {
    retry = false;

    amountToWithdraw = await promptAmount(
      'Please provide amount to withdraw. Use 0 to withdraw all known jettons:',
      ui,
    );
    ui.write(`${amountToWithdraw}`);
    if (amountToWithdraw == '0.000000000') {
      ui.write(`Withdrawing ${knownJettonBalance}\n`);
    } else {
      ui.write(`Withdrawing ${amountToWithdraw}\n`);
    }
    retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  } while (retry);
  const res = await minterStakingContract.sendWithdraw(sender, toNano(amountToWithdraw));
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
    const contractBalanceAfter = BigInt(
      (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account.balance.coins,
    );

    if (contractBalanceAfter < contractBalanceBefore) {
      ui.write('Withdrawal successfull!\nYou have received:' + fromNano(contractBalanceBefore - contractBalanceAfter));
    } else {
      ui.write('Withdrawal failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Withdraw Action === === ===

// === === === Change Price Action === === ===
const changePriceAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let newPrice: string;
  let forwardAmount: string;

  do {
    retry = false;
    const fallbackAddr = sender.address ?? (await minterStakingContract.getAdminAddress());
    newPrice = await promptAmount('Please provide new price in decimal form:', ui);
    ui.write(`Change price to ${newPrice}?\n`);
    retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  } while (retry);

  ui.write(`Changing price to ${newPrice}?\n`);
  const nanoPrice = toNano(newPrice);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  const res = await minterStakingContract.sendChangePrice(sender, nanoPrice);
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const PriceAfter = await minterStakingContract.getStakingPrice();
    if (PriceAfter == nanoPrice) {
      ui.write('Change successfull!\nCurrent price:' + fromNano(nanoPrice));
    } else {
      ui.write('Change failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Price Action === === ===

// === === === Change Minimum Withdraw Action === === ===
const changeMinimumWithdrawAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let newWithdraw: string;
  let forwardAmount: string;

  do {
    retry = false;
    const fallbackAddr = sender.address ?? (await minterStakingContract.getAdminAddress());
    newWithdraw = await promptAmount('Please provide minimum withdraw amount in decimal form:', ui);
    ui.write(`Change minimum withdraw to ${newWithdraw}?\n`);
    retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  } while (retry);

  ui.write(`Changing minimum withdraw to ${newWithdraw}?\n`);
  const nanoMinimumWithdraw = toNano(newWithdraw);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  const res = await minterStakingContract.sendChangeWithdraw(sender, nanoMinimumWithdraw);
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const WithdrawAfter = await minterStakingContract.getStakingWithdrawMinimum();
    if (WithdrawAfter == nanoMinimumWithdraw) {
      ui.write('Change successfull!\nCurrent minimum autowithdraw:' + fromNano(nanoMinimumWithdraw));
    } else {
      ui.write('Change failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Change Minimum Withdraw Action === === ===

// === === === Set Jetton Address Action === === ===
const setInJettonWalletAddressAction = async (provider: NetworkProvider, ui: UIProvider) => {
  const sender = provider.sender();
  let retry: boolean;
  let address: Address;

  // do {
  //   retry = false;
  //   address = await promptAddress('Please provide jetton wallet address:', ui);
  //   ui.write(`Set jetton wallet address to ${address.toString()}?\n`);
  //   retry = !(await promptBool('Is it ok?(yes/no)', ['yes', 'no'], ui));
  // } while (retry);

  if (!sender.address) {
    throw new Error('Sender address is not provided');
  }

  const inJettonInfo = await minterStakingContract.getInJettonInfo();

  const inJettonMinter = provider.open(JettonMinter.createFromAddress(inJettonInfo.jettonMinterAddress));
  const inJettonWalletAddress = await inJettonMinter.getWalletAddress(minterStakingContract.address);

  const lastSeqno = (await provider.api().getLastBlock()).last.seqno;
  const curState = (await provider.api().getAccountLite(lastSeqno, minterStakingContract.address)).account;

  if (curState.last === null) throw "Last transaction can't be null on deployed contract";

  await minterStakingContract.sendSetInJettonWalletAddress(sender, inJettonWalletAddress);
  const gotTrans = await waitForTransaction(provider, minterStakingContract.address, curState.last.lt, 30);
  if (gotTrans) {
    const inJettonInfoAfter = await minterStakingContract.getInJettonInfo();
    if (inJettonInfoAfter.jettonWalletAddress.equals(inJettonWalletAddress)) {
      ui.write('Change successful!\nCurrent jetton wallet address:' + inJettonInfoAfter.jettonWalletAddress.toString());
    } else {
      ui.write('Change failed!');
    }
  } else {
    failedTransMessage(ui);
  }
};
// === === === end Set Jetton Address Action === === === ===

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();
  const sender = provider.sender();
  const hasSender = sender.address !== undefined;
  const api = provider.api();
  const minterStakingCode = await compile('JettonMinterStaking');
  let done = false;
  let retry: boolean;
  let StakingAddress: Address;

  do {
    retry = false;
    StakingAddress = await promptAddress('Please enter staking address:', ui);
    const isContractDeployed = await provider.isContractDeployed(StakingAddress);
    if (!isContractDeployed) {
      retry = true;
      ui.write('This contract is not active!\nPlease use another address, or deploy it first');
    } else {
      const lastSeqno = (await api.getLastBlock()).last.seqno;
      const contractState = (await api.getAccount(lastSeqno, StakingAddress)).account.state as {
        data: string | null;
        code: string | null;
        type: 'active';
      };
      if (!Cell.fromBase64(contractState.code as string).equals(minterStakingCode)) {
        ui.write('Contract code differs from the current contract version!\n');
        const resp = await ui.choose('Use address anyway', ['Yes', 'No'], (c) => c);
        retry = resp == 'No';
      }
    }
  } while (retry);

  minterStakingContract = provider.open(JettonMinterStaking.createFromAddress(StakingAddress));
  const isAdmin = hasSender ? (await minterStakingContract.getAdminAddress()).equals(sender.address) : true;
  let actionList: string[];
  if (isAdmin) {
    actionList = [...userActions, ...adminActions];
    ui.write('Current wallet is Staking admin!\n');
  } else {
    actionList = userActions;
    ui.write('Current wallet is not admin!\nAvaliable actions restricted\n');
  }

  do {
    const action = await ui.choose('Pick action:', actionList, (c) => c);
    switch (action) {
      case 'Mint':
        await mintAction(provider, ui);
        break;
      case 'Stake':
        await StakeAction(provider, ui);
        break;
      case 'Withdrawal':
        await withdrawalAction(provider, ui);
        break;
      case 'Change admin':
        await changeAdminAction(provider, ui);
        break;
      case 'Change content':
        await changeContentAction(provider, ui);
        break;
      case 'Change state':
        await changeStateAction(provider, ui);
        break;
      case 'Change price':
        await changePriceAction(provider, ui);
        break;
      case 'Change minimum withdraw':
        await changeMinimumWithdrawAction(provider, ui);
        break;
      case 'Change withdraw address':
        await changeWithdrawAddressAction(provider, ui);
        break;
      case 'Set jetton wallet address':
        await setInJettonWalletAddressAction(provider, ui);
        break;
      case 'Info':
        await infoAction(provider, ui);
        break;
      case 'Quit':
        done = true;
        break;
    }
  } while (!done);
}
