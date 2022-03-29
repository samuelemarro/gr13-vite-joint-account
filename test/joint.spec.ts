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

const viteId = 'tti_5649544520544f4b454e6e40';
const viteFullId = '000000000000000000000000000000000000000000005649544520544f4b454e';

const NULL = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

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

describe('test JointAccount', function () {
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
        const compiledContracts = await vite.compile('JointAccount.solpp',);
        expect(compiledContracts).to.have.property('JointAccount');
        contract = compiledContracts.JointAccount;
        // deploy
        contract.setDeployer(deployer).setProvider(provider);
    });
    describe('account creation', function() {
        it('creates an account', async function() {
            await contract.deploy({params: [[alice.address, bob.address], 1], responseLatency: 1});
            expect(contract.address).to.be.a('string');

            expect(await contract.query('getMembers')).to.be.deep.equal([[alice.address, bob.address]]);
            expect(await contract.query('approvalThreshold')).to.be.deep.equal(['1']);
        });

        it('creates an account with as many members as required votes', async function() {
            await contract.deploy({params: [[alice.address, bob.address], 2], responseLatency: 1});
            expect(contract.address).to.be.a('string');

            expect(await contract.query('getMembers')).to.be.deep.equal([[alice.address, bob.address]]);
            expect(await contract.query('approvalThreshold')).to.be.deep.equal(['2']);
        });

        /*it('fails to create an account with 0 members', async function() {
            expect(
                contract.deploy({params: [[], 1], responseLatency: 1})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create an account with an approval threshold of 0', async function() {
            expect(
                contract.deploy({params: [[alice.address], 1], responseLatency: 1})
            ).to.eventually.be.rejectedWith('revert');
        });

        it('fails to create an account with an approval threshold higher than the number of members', async function() {
            expect(
                contract.deploy({params: [[alice.address], 2], responseLatency: 1})
            ).to.eventually.be.rejectedWith('revert');
        });*/
    })

    describe('transfer motion', function() {
        it('creates and votes a transfer motion', async function() {
            await contract.deploy({params: [[alice.address, bob.address], 2], responseLatency: 1});
            expect(contract.address).to.be.a('string');
            
            expect(await contract.query('getMembers')).to.be.deep.equal([[alice.address, bob.address]]);

            expect(await contract.query('isMember', [alice.address])).to.be.deep.equal(['1']);

            //const height = await contract.height();
            await deployer.sendToken(contract.address, '1000000', testTokenId);
            //await contract.waitForHeight(height + 2);
            await waitForContractReceive(testTokenId);
            console.log(await contract.balance(testTokenId));

            await contract.call('createTransferMotion', [testTokenId, '50', charlie.address], {caller: alice});
            await charlie.receiveAll();

            // Motion hasn't been approved yet
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('0');

            await contract.call('voteMotion', ['0'], {caller: bob});
            await charlie.receiveAll();

            // Motion was approved
            expect(await charlie.balance(testTokenId)).to.be.deep.equal('50');

            const events = await contract.getPastEvents('allEvents', {fromHeight: 0, toHeight: 100});
            checkEvents(events, [
                {
                    '0': '0', motionId: '0',
                    '1': '0', motionType: '0',
                    '2': alice.address, proposer: alice.address,
                    '3': testTokenId, tokenId: testTokenId,
                    '4': '50', transferAmount: '50',
                    '5': charlie.address, to: charlie.address,
                    '6': NULL, threshold: NULL
                }, // Motion created
                {
                    '0': '0', motionId: '0',
                    '1': alice.address, voter: alice.address,
                    '2': '1', vote: '1'
                }, // Alice votes yes
                {
                    '0': '0', motionId: '0',
                    '1': bob.address, voter: bob.address,
                    '2': '1', vote: '1'
                }, // Bob votes yes
                {
                    '0': '0', motionId: '0',
                    '1': testFullId(), tokenId: testFullId(),
                    '2': charlie.address, to: charlie.address,
                    '3': '50', amount: '50'
                }, // Transfer is executed
            ]);
        });
    })
});