// NOTE: Queries are authomatically retried and don't fail (while calls do), so some query tests have been written as call tests.

import { describe } from "mocha";
import chai from "chai";
const vite = require('@vite/vuilder');
import chaiAsPromised from "chai-as-promised";
import config from "./vite.config.json";
const { accountBlock : {createAccountBlock, ReceiveAccountBlockTask} } = require("@vite/vitejs");

chai.use(chaiAsPromised);
const expect = chai.expect;

let provider: any;
let deployer: any;
let alice: any;
let bob: any;
let charlie: any;
let contract: any;
let mnemonicCounter = 1;

const viteFullId = '000000000000000000000000000000000000000000005649544520544f4b454e';

const NULL = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const NULL_ADDRESS = 'vite_0000000000000000000000000000000000000000a4f3a0cb58';
const NULL_TOKEN = 'tti_000000000000000000004cfd';

const toFull = (id : string) => {
    const replacedId = id.replace('tti_', '00000000000000000000000000000000000000000000');
    return replacedId.substring(0, replacedId.length - 4);
}

let testTokenId : any;
const testFullId = () => toFull(testTokenId);

const waitForContractReceive = async (tokenId: string) => {
    do {} while (await contract.balance(tokenId) == '0');
}

const checkEvents = (result : any, correct : Array<Object>) => {
    expect(result).to.be.an('array').with.length(correct.length);
    for (let i = 0; i < correct.length; i++) {
        expect(result[i].returnValues).to.be.deep.equal(correct[i]);
    }
}


async function receiveIssuedTokens() {
    const blockTask = new ReceiveAccountBlockTask({
        address: deployer.address,
        privateKey: deployer.privateKey,
        provider
    });
    let resolveFunction : any;
    const promiseFunction = (resolve : any) => {
        resolveFunction = resolve;
    };
    blockTask.onSuccess((data : any) => {
        resolveFunction(data);
    });

    blockTask.start();
    return new Promise(promiseFunction);
}

describe('test JointAccounts', function () {
    before(async function() {
        provider = vite.localProvider();
        deployer = vite.newAccount(config.networks.local.mnemonic, 0);

        const block = createAccountBlock("issueToken", {
            address: deployer.address,
            tokenName: "Test Token",
            isReIssuable: true,
            maxSupply: 100000000,
            totalSupply: 100000000,
            isOwnerBurnOnly: false,
            decimals: 2,
            tokenSymbol: "TEST",
            provider,
            privateKey: deployer.privateKey
          })
        
        block.setProvider(provider);
        block.setPrivateKey(deployer.privateKey);
        await block.autoSend();

        await deployer.receiveAll();
        await receiveIssuedTokens();

        //console.log(tokenResult);
        const tokenInfoList = (
            await provider.request("contract_getTokenInfoList", 0, 1000)
          ).tokenInfoList;
        testTokenId = tokenInfoList.find(
            (e : any) =>
              e.tokenId !== viteFullId && e.owner === deployer.address
        ).tokenId;
        //testTokenId = tokenInfo.tokenId;
    })
    beforeEach(async function () {
        // init users
        alice = vite.newAccount(config.networks.local.mnemonic, mnemonicCounter++);
        bob = vite.newAccount(config.networks.local.mnemonic, mnemonicCounter++);
        charlie = vite.newAccount(config.networks.local.mnemonic, mnemonicCounter++);
        await deployer.sendToken(alice.address, '0');
        await alice.receiveAll();
        await deployer.sendToken(bob.address, '0');
        await bob.receiveAll();
        await deployer.sendToken(charlie.address, '0');
        await charlie.receiveAll();

        // compile
        const compiledContracts = await vite.compile('JointAccounts.solpp',);
        expect(compiledContracts).to.have.property('JointAccounts');
        contract = compiledContracts.JointAccounts;
        // deploy
        contract.setDeployer(deployer).setProvider(provider);
        await contract.deploy({responseLatency: 1});
        expect(contract.address).to.be.a('string');
    });

    describe('account creation', function() {
        it('creates an account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 1, 0], {caller: alice});

            expect(await contract.query('accountExists', [0])).to.be.deep.equal(['1']);
            expect(await contract.query('isStatic', [0])).to.be.deep.equal(['1']);
            expect(await contract.query('isMemberOnlyDeposit', [0])).to.be.deep.equal(['0']);
            expect(await contract.query('getMembers', [0])).to.be.deep.equal([[alice.address, bob.address]]);
            expect(await contract.query('approvalThreshold', [0])).to.be.deep.equal(['1']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                } // Account created
            ]);
        });

        it('creates an account with as many members as required votes', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            expect(await contract.query('accountExists', [0])).to.be.deep.equal(['1']);
            expect(await contract.query('isStatic', [0])).to.be.deep.equal(['1']);
            expect(await contract.query('isMemberOnlyDeposit', [0])).to.be.deep.equal(['0']);
            expect(await contract.query('getMembers', [0])).to.be.deep.equal([[alice.address, bob.address]]);
            expect(await contract.query('approvalThreshold', [0])).to.be.deep.equal(['2']);
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                } // Account created
            ]);
        });

        it('creates two accounts', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 1, 1, 0], {caller: alice});

            expect(await contract.query('accountExists', [0])).to.be.deep.equal(['1']);
            expect(await contract.query('accountExists', [1])).to.be.deep.equal(['1']);
            expect(await contract.query('accountExists', [2])).to.be.deep.equal(['0']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '1', accountId: '1',
                    '1': alice.address, creator: alice.address
                } // Account created
            ]);
        });
    })

    describe('deposit', function() {
        it('deposits to an account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['1000000']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                } // Alice deposits
            ]);
        });

        it('deposits as a non-member to a regular account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(charlie.address, '1000000', testTokenId);
            await charlie.receiveAll();
            await contract.call('deposit', [0], {caller: charlie, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['1000000']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': charlie.address, from: charlie.address,
                    '3': '1000000', amount: '1000000'
                } // Charlie deposits
            ]);
        });

        it('fails to deposit to a non-existent account', async function() {
            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();

            expect(
                contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId})
            ).to.be.eventually.rejectedWith('revert');
        });

        it('fails to deposit as a non-member to a member-only deposit account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 1], {caller: alice});

            await deployer.sendToken(charlie.address, '1000000', testTokenId);
            await charlie.receiveAll();

            expect(
                contract.call('deposit', [0], {caller: charlie, amount: '1000000', tokenId: testTokenId})
            ).to.be.eventually.rejectedWith('revert');
        });
    })

    describe('transfer motion', function() {
        it('creates and votes a transfer motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['0']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([testTokenId]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal(['50']);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([charlie.address]);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([alice.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Motion hasn't been approved yet
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('0');

            await contract.call('voteMotion', [0, '0'], {caller: bob});
            await charlie.receiveAll();

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('50');

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': charlie.address, to: charlie.address,
                    '4': NULL, destinationAccount: NULL,
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('creates and immediately approves a transfer motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            // Motion was approved
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('50');

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': charlie.address, to: charlie.address,
                    '4': NULL, destinationAccount: NULL,
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('fails to create a transfer motion without enough funds', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '1000001', charlie.address, NULL], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute a transfer motion due to not having enough funds', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            // First motion. Since there are enough funds, it can be created
            await contract.call('createTransferMotion', [0, testTokenId, '1000000', charlie.address, NULL], {caller: alice});

            // Second motion. Again this one can be created
            await contract.call('createTransferMotion', [0, testTokenId, '1000000', charlie.address, NULL], {caller: alice});

            // First motion is approved, contract balance is now 0
            await contract.call('voteMotion', [0, '0'], {caller: bob});
            await charlie.receiveAll();
            expect(await contract.balance(testTokenId)).to.be.deep.equal('0');

            expect(await contract.query('voteCount', [0, 1])).to.be.deep.equal(['1']);

            // Second motion is voted, fails
            expect(
                contract.call('voteMotion', [0, 1], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a transfer motion to both an external and an internal account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, '1'], {caller: alice})
            ).to.be.eventually.rejectedWith('revert');
        });

        it('fails to create a transfer motion to neither an external nor an internal account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '50', NULL_ADDRESS, NULL], {caller: alice})
            ).to.be.eventually.rejectedWith('revert');
        });
    })

    describe('internal transfer motion', function() {
        it('creates and votes an internal transfer motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', NULL_ADDRESS, '1'], {caller: alice});
            await charlie.receiveAll();

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['0']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([testTokenId]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal(['50']);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([NULL_ADDRESS]);
            expect(await contract.query('destinationAccount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([alice.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Motion hasn't been approved yet
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['1000000']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['0']);

            await contract.call('voteMotion', [0, '0'], {caller: bob});
            await charlie.receiveAll();

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            // Contract's balance didn't change
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['999950']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['50']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '1', accountId: '1',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': '1', destinationAccount: '1',
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': NULL_ADDRESS, to: NULL_ADDRESS,
                    '4': '1', destinationAccount: '1',
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('creates and immediately approves an internal transfer motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', NULL_ADDRESS, '1'], {caller: alice});

            // Motion was approved
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['999950']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['50']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '1', accountId: '1',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': '1', destinationAccount: '1',
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': NULL_ADDRESS, to: NULL_ADDRESS,
                    '4': '1', destinationAccount: '1',
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('creates and votes an internal transfer motion to a regular account without being a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', NULL_ADDRESS, '1'], {caller: bob});
            await charlie.receiveAll();

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['0']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([testTokenId]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal(['50']);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([NULL_ADDRESS]);
            expect(await contract.query('destinationAccount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([bob.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['0']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion hasn't been approved yet
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['1000000']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['0']);

            await contract.call('voteMotion', [0, '0'], {caller: alice});
            await charlie.receiveAll();

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            // Contract's balance didn't change
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['999950']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['50']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '1', accountId: '1',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': bob.address, proposer: bob.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': '1', destinationAccount: '1',
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': NULL_ADDRESS, to: NULL_ADDRESS,
                    '4': '1', destinationAccount: '1',
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('fails to create an internal transfer motion without enough funds', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '1000001', NULL_ADDRESS, '1'], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create an internal transfer motion without enough account-specific funds', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000001', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});
            await contract.call('deposit', [1], {caller: alice, amount: '1', tokenId: testTokenId});
            await waitForContractReceive(testTokenId);

            // There is enough money, but it's split between accounts
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000001');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['1000000'])
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['1'])

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '1000001', NULL_ADDRESS, '1'], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute an internal transfer motion due to not having enough funds', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            // First motion. Since there are enough funds, it can be created
            await contract.call('createTransferMotion', [0, testTokenId, '1000000', NULL_ADDRESS, '1'], {caller: alice});

            // Second motion. Again this one can be created
            await contract.call('createTransferMotion', [0, testTokenId, '1000000', NULL_ADDRESS, '1'], {caller: alice});

            // First motion is approved, account balance is now 0
            await contract.call('voteMotion', [0, '0'], {caller: bob});
            expect(await contract.balance(testTokenId)).to.be.deep.equal('1000000');
            expect(await contract.query('balanceOf', [0, testTokenId])).to.be.deep.equal(['0']);
            expect(await contract.query('balanceOf', [1, testTokenId])).to.be.deep.equal(['1000000'])

            expect(await contract.query('voteCount', [0, 1])).to.be.deep.equal(['1']);

            // Second motion is voted, fails
            expect(
                contract.call('voteMotion', [0, 1], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create an internal transfer motion to a non-existent account', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '1000000', NULL_ADDRESS, '1'], {caller: alice})
            ).to.be.eventually.rejectedWith('revert');
        });

        it('fails to create an internal transfer motion to a member-only deposit account without being a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            await contract.call('createAccount', [[alice.address, charlie.address], 2, 1, 1], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            // Bob isn't a member of the second account
            expect(
                contract.call('createTransferMotion', [0, testTokenId, '1000000', NULL_ADDRESS, '1'], {caller: bob})
            ).to.be.eventually.rejectedWith('revert');
        });

        it('fails to execute an internal transfer motion to a member-only deposit account after being removed', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});
            // Non-static and member-only
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 1], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            // First motion. Since Bob is a member of account #1, it can be created
            await contract.call('createTransferMotion', [0, testTokenId, '1000000', NULL_ADDRESS, '1'], {caller: bob});

            // Remove Bob from account #1
            await contract.call('createRemoveMemberMotion', [1, bob.address], {caller: alice});

            // Alice votes the first motion, fails
            expect(
                contract.call('voteMotion', [0, 1], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('add member motion', function() {
        it('creates and votes an add member motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 0, 0], {caller: alice});

            await contract.call('createAddMemberMotion', [0, charlie.address], {caller: alice});

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([NULL_TOKEN]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([charlie.address]);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([alice.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Motion hasn't been approved yet
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            await contract.call('voteMotion', [0, '0'], {caller: bob});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['3']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['1']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '1', motionType: '1',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': charlie.address, member: charlie.address
                } // Charlie is added
            ]);
        });

        it('creates and immediately approves an add member motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createAddMemberMotion', [0, charlie.address], {caller: alice});

            // Motion was approved
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['3']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['1']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '1', motionType: '1',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': charlie.address, member: charlie.address
                } // Charlie is added
            ]);
        });

        it('fails to create an add member motion for a static contract', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            expect(
                contract.call('createAddMemberMotion', [0, charlie.address], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create an add member motion of a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 0, 0], {caller: alice});

            expect(
                contract.call('createAddMemberMotion', [0, bob.address], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute an add member motion due to Charlie already being a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 0, 0], {caller: alice});

            // First motion. Since Charlie is not a member, it can be created
            await contract.call('createAddMemberMotion', [0, charlie.address], {caller: alice});

            // Second motion. Again this one can be created
            await contract.call('createAddMemberMotion', [0, charlie.address], {caller: alice})

            // First motion is approved, Charlie is now a member
            await contract.call('voteMotion', [0, '0'], {caller: bob});
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['3']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['1']);

            expect(await contract.query('voteCount', [0, 1])).to.be.deep.equal(['1']);

            // Second motion is voted, fails
            expect(
                contract.call('voteMotion', [0, 1], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('remove member motion', function() {
        it('creates and votes a remove member motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 2, 0, 0], {caller: alice});
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([NULL_TOKEN]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([charlie.address]);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([alice.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Motion hasn't been approved yet
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['3']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['1']);

            await contract.call('voteMotion', [0, '0'], {caller: bob});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '2', motionType: '2',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': charlie.address, member: charlie.address
                } // Charlie is removed
            ]);
        });

        it('creates and immediately approves a remove member motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 1, 0, 0], {caller: alice});

            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});

            // Motion was approved
            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '2', motionType: '2',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': charlie.address, member: charlie.address
                } // Charlie is removed
            ]);
        });

        it('fails to vote after being removed', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 2, 0, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice})

            // Remove Charlie
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});
            await contract.call('voteMotion', [0, 1], {caller: bob});

            // expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            expect(
                contract.call('voteMotion', [0, '0'], {caller: charlie})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a remove member motion for a static contract', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            expect(
                contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a remove member motion of a non-member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            expect(
                contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute a remove member motion due to Charlie already being removed', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 2, 0, 0], {caller: alice});

            // First motion. Since Charlie is a member, it can be created
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});

            // Second motion. Again this one can be created
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice})

            // First motion is approved, Charlie is no longer a member
            await contract.call('voteMotion', [0, '0'], {caller: bob});
            //expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            expect(await contract.query('voteCount', [0, 1])).to.be.deep.equal(['1']);

            // Second motion is voted, fails
            expect(
                contract.call('voteMotion', [0, 1], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute a remove member motion due to the approval threshold being too high', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 2, 0, 0], {caller: alice});

            // Since the threshold is 2, it can be created
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});

            // Increase the threshold to 3
            await contract.call('createChangeThresholdMotion', [0, 3], {caller: alice})
            await contract.call('voteMotion', [0, 1], {caller: bob});

            // Second motion is approved, threshold is now 3
            expect(await contract.query('approvalThreshold', [0, ])).to.be.deep.equal(['3']);

            // First motion is voted, fails
            // 2nd vote out of 3
            contract.call('voteMotion', [0, 0], {caller: bob});

            // 3rd vote out of 3
            expect(
                contract.call('voteMotion', [0, 0], {caller: charlie})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('change threshold motion', function() {
        it('creates and votes a change threshold motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 0, 0], {caller: alice});

            await contract.call('createChangeThresholdMotion', [0, 1], {caller: alice});

            expect(await contract.query('motionExists', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('motionType', [0, 0])).to.be.deep.equal(['3']);
            expect(await contract.query('tokenId', [0, 0])).to.be.deep.equal([NULL_TOKEN]);
            expect(await contract.query('transferAmount', [0, 0])).to.be.deep.equal([NULL]);
            expect(await contract.query('to', [0, 0])).to.be.deep.equal([NULL_ADDRESS]);
            expect(await contract.query('threshold', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('proposer', [0, 0])).to.be.deep.equal([alice.address]);
            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['1']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Motion hasn't been approved yet
            expect(await contract.query('approvalThreshold', [0, ])).to.be.deep.equal(['2']);

            await contract.call('voteMotion', [0, '0'], {caller: bob});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Motion was approved
            expect(await contract.query('approvalThreshold', [0, ])).to.be.deep.equal(['1']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '3', motionType: '3',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': NULL, destinationAccount: NULL,
                    '8': '1', threshold: '1'
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '1', threshold: '1'
                } // Threshold is changed
            ]);
        });

        it('creates and immediately approves a change threshold motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            await contract.call('createChangeThresholdMotion', [0, 2], {caller: alice});

            // Motion was approved
            expect(await contract.query('approvalThreshold', [0])).to.be.deep.equal(['2']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '3', motionType: '3',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': NULL, destinationAccount: NULL,
                    '8': '2', threshold: '2'
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '2', threshold: '2'
                } // Threshold is changed
            ]);
        });

        it('makes voting on a motion possible after decreasing the threshold', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 0, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});

            // Lower the threshold
            await contract.call('createChangeThresholdMotion', [0, 1], {caller: alice});
            await contract.call('voteMotion', [0, 1], {caller: bob});
            expect(await contract.query('approvalThreshold', [0])).to.be.deep.equal(['1']);

            // Alice votes again
            await contract.call('voteMotion', [0, 0], {caller: alice});
            await charlie.receiveAll();

            // Motion was approved
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('50');

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Transfer motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes on the transfer
                {
                    '0': '0', accountId: '0',
                    '1': '1', motionId: '1',
                    '2': '3', motionType: '3',
                    '3': alice.address, proposer: alice.address,
                    '4': NULL_TOKEN, tokenId: NULL_TOKEN,
                    '5': NULL, transferAmount: NULL,
                    '6': NULL_ADDRESS, to: NULL_ADDRESS,
                    '7': NULL, destinationAccount: NULL,
                    '8': '1', threshold: '1'
                }, // Change approval threshold motion created
                {
                    '0': '0', accountId: '0',
                    '1': '1', motionId: '1',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes on the threshold change
                {
                    '0': '0', accountId: '0',
                    '1': '1', motionId: '1',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes on the threshold change
                {
                    '0': '0', accountId: '0',
                    '1': '1', motionId: '1',
                    '2': '1', threshold: '1'
                }, // Threshold is changed
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes on the transfer again
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': charlie.address, to: charlie.address,
                    '4': NULL, destinationAccount: NULL,
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('fails to create a change threshold motion for a static contract', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            expect(
                contract.call('createChangeThresholdMotion', [0, 2], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a change threshold motion with 0', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            expect(
                contract.call('createChangeThresholdMotion', [0, 0], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a change threshold motion with 0', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            expect(
                contract.call('createChangeThresholdMotion', [0, 0], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create a change threshold motion higher than the number of members', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 0, 0], {caller: alice});

            expect(
                contract.call('createChangeThresholdMotion', [0, 3], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to execute a change threshold motion due to the number of members now being lower', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 2, 0, 0], {caller: alice});

            // Since 3 <= members.length, it can be created
            await contract.call('createChangeThresholdMotion', [0, 3], {caller: alice});

            // Remove Charlie
            await contract.call('createRemoveMemberMotion', [0, charlie.address], {caller: alice});
            await contract.call('voteMotion', [0, '1'], {caller: bob});

            // The number of members is now 3
            //expect(await contract.query('memberCount', [0, ])).to.be.deep.equal(['2']);
            expect(await contract.query('isMember', [0, charlie.address])).to.be.deep.equal(['0']);

            // First motion is voted, fails
            expect(
                contract.call('voteMotion', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('cancel vote', function() {
        it('cancels a vote', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            // Alice votes yes as part of the motion creation process
            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Alice cancels the vote
            await contract.call('cancelVote', [0, '0'], {caller: alice});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['0']);
            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['0']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['0']);

            // Bob votes yes
            await contract.call('voteMotion', [0, '0'], {caller: bob});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['0']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            // Alice votes yes
            await contract.call('voteMotion', [0, '0'], {caller: alice});

            expect(await contract.query('voteCount', [0, 0])).to.be.deep.equal(['2']);
            expect(await contract.query('voted', [0, 0, alice.address])).to.be.deep.equal(['1']);
            expect(await contract.query('voted', [0, 0, bob.address])).to.be.deep.equal(['1']);

            await charlie.receiveAll();
            
            // Motion was approved
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('50');

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '0', vote: '0'
                }, // Alice votes no
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': bob.address, voter: bob.address,
                    '3': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': testFullId(), tokenId: testFullId(),
                    '3': charlie.address, to: charlie.address,
                    '4': NULL, destinationAccount: NULL,
                    '5': '50', amount: '50'
                } // Transfer is executed
            ]);
        });

        it('fails to cancel a vote twice (as proposer)', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            await contract.call('cancelVote', [0, 0], {caller: alice});

            expect(
                contract.call('cancelVote', [0, 0], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to cancel a vote twice (as non-proposer)', async function() {
            await contract.call('createAccount', [[alice.address, bob.address, charlie.address], 3, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            await contract.call('voteMotion', [0, 0], {caller: bob});

            await contract.call('cancelVote', [0, 0], {caller: bob});

            expect(
                contract.call('cancelVote', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to cancel a vote without voting', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            expect(
                contract.call('cancelVote', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('cancel motion', function() {
        it('cancels a motion', async function () {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            await contract.call('cancelMotion', [0, 0], {caller: alice});

            expect(await contract.query('active', [0, 0])).to.be.deep.equal(['0']);

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', accountId: '0',
                    '1': alice.address, creator: alice.address
                }, // Account created
                {
                    '0': '0', accountId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': alice.address, from: alice.address,
                    '3': '1000000', amount: '1000000'
                }, // Alice deposits
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': '0', motionType: '0',
                    '3': alice.address, proposer: alice.address,
                    '4': testTokenId, tokenId: testTokenId,
                    '5': '50', transferAmount: '50',
                    '6': charlie.address, to: charlie.address,
                    '7': NULL, destinationAccount: NULL,
                    '8': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0',
                    '2': alice.address, voter: alice.address,
                    '3': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', accountId: '0',
                    '1': '0', motionId: '0'
                } // Alice cancels motion
            ]);
        });

        it('fails to cancel an inactive motion', async function () {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});

            await contract.call('voteMotion', [0, 0], {caller: bob})
            await charlie.receiveAll();

            expect(
                contract.call('cancelMotion', [0, 0], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote on an inactive motion', async function () {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});

            await contract.call('cancelMotion', [0, 0], {caller: alice});

            expect(
                contract.call('voteMotion', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });
    })

    describe('motion checks', function() {
        it('fails to create a motion without being a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            expect(
                contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: charlie})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote on a non-existent motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            expect(
                contract.call('voteMotion', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote without being a member', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            expect(
                contract.call('voteMotion', [0, 0], {caller: charlie})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote twice (as proposer)', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            expect(
                contract.call('voteMotion', [0, 0], {caller: alice})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote twice (as non-proposer)', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 2, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            await contract.call('voteMotion', [0, 0], {caller: bob})

            expect(
                contract.call('voteMotion', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to vote an inactive motion', async function() {
            await contract.call('createAccount', [[alice.address, bob.address], 1, 1, 0], {caller: alice});

            await deployer.sendToken(alice.address, '1000000', testTokenId);
            await alice.receiveAll();
            await contract.call('deposit', [0], {caller: alice, amount: '1000000', tokenId: testTokenId});;
            await waitForContractReceive(testTokenId);

            await contract.call('createTransferMotion', [0, testTokenId, '50', charlie.address, NULL], {caller: alice});
            await charlie.receiveAll();

            expect(
                contract.call('voteMotion', [0, 0], {caller: bob})
            ).to.eventually.be.rejectedWith('revert');
        });
    })
});