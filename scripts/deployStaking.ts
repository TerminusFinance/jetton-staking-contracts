import { compile, NetworkProvider } from '@ton/blueprint';
import { address, OpenedContract, toNano } from '@ton/core';
import 'dotenv/config';
import { jettonContentToCell, JettonMinterStaking } from '../wrappers/JettonMinterStaking';

let minterStakingContract: OpenedContract<JettonMinterStaking>;

export async function run(provider: NetworkProvider) {
  const admin = address(process.env.JETTON_ADMIN ? process.env.JETTON_ADMIN : '');
  const content = jettonContentToCell({
    type: 1,
    uri: process.env.JETTON_CONTENT_URI ? process.env.JETTON_CONTENT_URI : '',
  });
  const wallet_code = await compile('JettonWallet');
  const state = 1; // 1 - Staking disabled, until jetton wallet address is obtained.
  const price = process.env.JETTON_PRICE ? BigInt(process.env.JETTON_PRICE).valueOf() : BigInt(1000000000);
  const inJettonMinterAddress = address(process.env.IN_JETTON_MINTER ? process.env.IN_JETTON_MINTER : '');

  const minter = provider.open(
    JettonMinterStaking.createFromConfig(
      {
        admin,
        content,
        wallet_code,
        state,
        price,
        inJettonMinterAddress,
      },
      await compile('JettonMinterStaking'),
    ),
  );

  await minter.sendDeploy(provider.sender(), toNano('0.2'), inJettonMinterAddress);

  await provider.waitForDeploy(minter.address);

  console.log('Jetton wallet: ', await minter.getInJettonInfo());
}
