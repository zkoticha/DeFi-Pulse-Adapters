/*==================================================
  Modules
  ==================================================*/

const sdk = require('../../sdk');
const _ = require('underscore');
const BigNumber = require('bignumber.js');

const getNumberOfOptionsContractsAbi = require('./abis/getNumberOfOptionsContracts.json');
const optionsContractsAbi = require('./abis/optionsContracts.json');
const collateralAbi = require('./abis/collateral.json');

/*==================================================
  Settings
  ==================================================*/

const factoriesAddressesV1 = [
  "0xb529964F86fbf99a6aA67f72a27e59fA3fa4FEaC",
  "0xcC5d905b9c2c8C9329Eb4e25dc086369D6C7777C"
]

const marginPoolV2 = '0x5934807cC0654d46755eBd2848840b616256C6Ef'

/*==================================================
  TVL
  ==================================================*/

async function tvl(timestamp, block) {
  let balances = {};

  for(let i = 0; i < factoriesAddressesV1.length; i++) {
    // number of created oTokens
    let numberOfOptionsContracts = (
      await sdk.api.abi.call({
        target: factoriesAddressesV1[i],
        abi: getNumberOfOptionsContractsAbi,
      })
    ).output;

    // batch getOptionsContracts calls
    let getOptionsContractsCalls = [];

    for(let j = 0; j < numberOfOptionsContracts; j++) {
      getOptionsContractsCalls.push({
        target: factoriesAddressesV1[i],
        params: j
      })
    }

    let optionsContracts = (
      await sdk.api.abi.multiCall({
        calls: getOptionsContractsCalls,
        abi: optionsContractsAbi,
        block
      })
    ).output;

    // list of options addresses
    let optionsAddresses = []

    _.each(optionsContracts, async (contracts) => {
      if(contracts.output != null) {
        optionsAddresses = [
          ...optionsAddresses,
          contracts.output
        ]
      }
    });

    // batch getCollateralAsset calls
    let getCollateralAssetCalls = [];

    _.each(optionsAddresses, (optionAddress) => {
      getCollateralAssetCalls.push({
        target: optionAddress
      })
    })

    // get list of options collateral assets
    let optionsCollateral = (
      await sdk.api.abi.multiCall({
        calls: getCollateralAssetCalls,
        abi: collateralAbi,
        block
      })
    ).output;

    let optionsCollateralAddresses = []

    _.each(optionsCollateral, async (collateralAsset) => {
      if(collateralAsset.output != null) {
        optionsCollateralAddresses = [
          ...optionsCollateralAddresses,
          collateralAsset.output
        ]
      }
    });

    // get ETH balance
    _.each(optionsAddresses, async (optionAddress) => {
      let balance = (await sdk.api.eth.getBalance({target: optionAddress, block})).output;
      balances["0x0000000000000000000000000000000000000000"] = BigNumber(balances["0x0000000000000000000000000000000000000000"] || 0).plus(BigNumber(balance)).toFixed();
    })

    // batch balanceOf calls
    let balanceOfCalls = [];
    let j = 0;

    _.each(optionsCollateralAddresses, async (optionCollateralAddress) => {
      if(optionCollateralAddress != "0x0000000000000000000000000000000000000000") {
        balanceOfCalls.push({
          target: optionCollateralAddress,
          params: [optionsAddresses[j]]
        });
      }
      j++;
    });

    // get tokens balances
    const balanceOfResults = await sdk.api.abi.multiCall({
      block,
      calls: balanceOfCalls,
      abi: "erc20:balanceOf"
    });

    await sdk.util.sumMultiBalanceOf(balances, balanceOfResults);
  }

  let balanceOfCallsV2 = [
    {
      target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', //USDC
      params: [marginPoolV2]
    },
    {
      target: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', //WETH
      params: [marginPoolV2]
    }
  ];
  const getV2Balance = await sdk.api.abi.multiCall({
    block,
    calls: balanceOfCallsV2,
    abi: "erc20:balanceOf"
  });
  await sdk.util.sumMultiBalanceOf(balances, getV2Balance);

  return balances;
}

/*==================================================
  Exports
  ==================================================*/

module.exports = {
  name: 'Opyn',
  token: null,
  category: 'derivatives',
  start: 1581542700,  // 02/12/2020 @ 09:25PM (UTC)
  tvl
}
