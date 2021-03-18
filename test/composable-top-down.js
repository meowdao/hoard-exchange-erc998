const etherlime = require('etherlime-lib');
const ethers = require('ethers');

const ComposableTopDown = require('../build/ComposableTopDown.json');
const SampleERC20 = require('../build/SampleERC20.json');
const SampleNFT = require('../build/SampleNFT.json');
const ContractIERC721ReceiverNew = require('../build/ContractIERC721ReceiverNew.json');
const ContractIERC721ReceiverOld = require('../build/ContractIERC721ReceiverOld.json');

describe('ComposableTopDown', async () => {
    const alice = accounts[1].signer;
    const bob = accounts[2].signer;
    const owner = accounts[9];
    const nonUsed = accounts[8].signer;
    const zeroAddress = ethers.utils.hexZeroPad('0x0', 20);

    const expectedTokenId = 1;
    const firstChildTokenId = 1;
    const aliceBalance = 1;
    const aliceBytes32Address = ethers.utils.hexZeroPad(alice.address, 32).toLowerCase();
    const bytesFirstToken = ethers.utils.hexZeroPad('0x1', 20);

    const NFTHash = '0x1234';

    beforeEach(async () => {
        deployer = new etherlime.EtherlimeGanacheDeployer(owner.secretKey);
        composableTopDownInstance = await deployer.deploy(
            ComposableTopDown,
            {}
        );
    });

    it('Should deploy ComposableTopDown Contract', async () => {
        assert.isAddress(
            composableTopDownInstance.contractAddress,
            'ComposableTopDownInstance not deployed'
        );
    });


    describe('NFT Transfers', async () => {
        beforeEach(async () => {
            sampleNFTInstance = await deployer.deploy(SampleNFT, {});

            // mint
            await sampleNFTInstance.mint721(alice.address, NFTHash);

            await composableTopDownInstance.mint(alice.address);
        });

        it('Should revert when trying to get balanceOf zero address', async () => {
            const expectedRevertMessage = 'ComposableTopDown: balanceOf _tokenOwner zero address';
            await assert.revertWith(composableTopDownInstance.balanceOf(zeroAddress), expectedRevertMessage);
        });

        it('Should deploy SampleNFT Contract and mint to alice', async () => {
            // then:
            assert.isAddress(
                sampleNFTInstance.contractAddress,
                'SampleNFT not deployed'
            );

            const hashTaken = await sampleNFTInstance.hashes(NFTHash);
            assert(hashTaken, 'NFTHash not taken');

            const balance = await composableTopDownInstance.balanceOf(alice.address);
            assert(balance.eq(aliceBalance), 'Invalid alice balance');
        });

        it('Should safeTransferFrom SampleNFT to Composable', async () => {
            // when:
            await safeTransferFromFirstToken();

            // then:
            const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
            assert(childExists, 'Composable does not own SampleNFT');

            const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId);
            assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid parent token id');

            const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
            assert(totalChildContracts.eq(1), 'Invalid total child contracts');

            const childContractAddress = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
            assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

            const tokenId = await composableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0);
            assert(tokenId.eq(expectedTokenId), 'Invalid token id found when querying child token by index');

            const owner = await sampleNFTInstance.ownerOf(expectedTokenId);
            assert(owner === composableTopDownInstance.contractAddress, 'Invalid owner address');
        });

        it('Should safeTransferFromOld SampleNFT to Composable', async () => {
            // when:
            await sampleNFTInstance.from(alice).safeTransferFromOld(
                alice.address,
                composableTopDownInstance.contractAddress,
                expectedTokenId,
                bytesFirstToken);

            // then:
            const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
            assert(childExists, 'Composable does not own SampleNFT');

            const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId);
            assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid parent token id');

            const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
            assert(totalChildContracts.eq(1), 'Invalid total child contracts');

            const childContractAddress = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
            assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

            const tokenId = await composableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0);
            assert(tokenId.eq(expectedTokenId), 'Invalid token id found when querying child token by index');
        });

        it('Should revert when trying to receive an erc721 with no data', async () => {
            const erc721Instance = await deployer.deploy(ContractIERC721ReceiverOld, {});
            await erc721Instance.mint721(alice.address);
            const expectedRevertMessage = 'ComposableTopDown: onERC721Received(4) _data must contain the uint256 tokenId to transfer the child token to';

            await assert.revert(erc721Instance.from(alice).safeTransferFrom(
                alice.address,
                composableTopDownInstance.contractAddress,
                expectedTokenId),
                expectedRevertMessage);
        });

        describe('Composable Approvals', async () => {
            beforeEach(async () => {
                await safeTransferFromFirstToken();
            });

            it('Should revert when trying to approve with not owner', async () => {
                const expectedRevertMessage = 'ComposableTopDown: approve msg.sender not owner';

                await assert.revertWith(composableTopDownInstance.from(bob).approve(bob.address, expectedTokenId), expectedRevertMessage);
            });

            it('Should successfully approve bob for first token', async () => {
                // when:
                await composableTopDownInstance.from(alice).approve(bob.address, expectedTokenId);

                // then:
                const approvedAddress = await composableTopDownInstance.getApproved(expectedTokenId);
                assert(approvedAddress === bob.address, 'Invalid approved address');
            });

            it('Should successfully emit Approval event', async () => {
                // given:
                const expectedEvent = 'Approval';

                // then:
                await assert.emit(
                    composableTopDownInstance.from(alice).approve(bob.address, expectedTokenId),
                    expectedEvent
                );
            });

            it('Should successfully emit Approval event arguments', async () => {
                // given:
                const expectedEvent = 'Approval';
                const approvedAddress = bob.address;

                // then:
                await assert.emitWithArgs(
                    composableTopDownInstance.from(alice).approve(approvedAddress, expectedTokenId),
                    expectedEvent,
                    [
                        alice.address,
                        approvedAddress,
                        expectedTokenId
                    ]
                );
            });

            it('Should revert when trying to setApprovalForAll zero address', async () => {
                const expectedRevertMessage = 'ComposableTopDown: setApprovalForAll _operator zero address';
                await assert.revertWith(composableTopDownInstance.setApprovalForAll(zeroAddress, true), expectedRevertMessage);
            });

            it('Should successfully setApprovalForAll', async () => {
                // when:
                await composableTopDownInstance.setApprovalForAll(bob.address, true);

                // then:
                const isApproved = await composableTopDownInstance.isApprovedForAll(owner.signer.address, bob.address);
                assert(isApproved, 'Bob not approved for owner actions');
            });

            it('Should successfully emit ApprovalForAll event', async () => {
                // given:
                const expectedEvent = 'ApprovalForAll';

                // then:
                await assert.emit(
                    composableTopDownInstance.setApprovalForAll(bob.address, true),
                    expectedEvent
                );
            });

            it('Should successfully emit ApprovalForAll event arguments', async () => {
                // given:
                const expectedEvent = 'ApprovalForAll';

                // then:
                await assert.emitWithArgs(
                    composableTopDownInstance.setApprovalForAll(bob.address, true),
                    expectedEvent,
                    [
                        owner.signer.address,
                        bob.address,
                        true
                    ]
                );
            });

            it('Should revert isApprovedForAll _owner zero address', async () => {
                const expectedRevertMessage = 'ComposableTopDown: isApprovedForAll _owner zero address';
                await assert.revertWith(composableTopDownInstance.isApprovedForAll(zeroAddress, bob.address), expectedRevertMessage);
            });

            it('Should revert isApprovedForAll _operator zero address', async () => {
                const expectedRevertMessage = 'ComposableTopDown: isApprovedForAll _operator zero address';
                await assert.revertWith(composableTopDownInstance.isApprovedForAll(owner.signer.address, zeroAddress), expectedRevertMessage);
            });
        });

        describe('Composable getChild', async () => {
            it('Should revert when trying to get unapproved', async () => {
                const expectedRevertMessage = 'ComposableTopDown: getChild msg.sender not approved';

                await assert.revertWith(
                    composableTopDownInstance.from(bob)
                        .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId),
                    expectedRevertMessage);
            });

            it('Should revert when trying to get unapproved from SampleNFT', async () => {
                const expectedRevertMessage = 'ERC721: transfer caller is not owner nor approved';
                await assert.revertWith(
                    composableTopDownInstance.from(alice)
                        .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId),
                    expectedRevertMessage);
            });

            it('Should revert when trying to get unapproved from SampleNFT', async () => {
                const expectedRevertMessage = 'ERC721: transfer caller is not owner nor approved';
                await assert.revertWith(
                    composableTopDownInstance.from(alice)
                        .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId),
                    expectedRevertMessage);
            });

            it('Should successfully getChild', async () => {
                // given:
                await sampleNFTInstance.from(alice)
                    .approve(composableTopDownInstance.contractAddress, expectedTokenId);

                // when:
                await composableTopDownInstance.from(alice)
                    .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId);

                //then:
                const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(childExists, 'Composable does not own SampleNFT');

                const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid parent token id');

                const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                const childContractAddress = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
                assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

                const tokenId = await composableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0);
                assert(tokenId.eq(expectedTokenId), 'Invalid token id found when querying child token by index');
            });

            it('Should successfully getChild using bob as intermediary for alice using setApprovalForAll', async () => {
                // given:
                await sampleNFTInstance.from(alice)
                    .approve(composableTopDownInstance.contractAddress, expectedTokenId);

                await sampleNFTInstance.from(alice)
                    .setApprovalForAll(bob.address, true);

                // when:
                await composableTopDownInstance.from(bob)
                    .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId);

                //then:
                const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(childExists, 'Composable does not own SampleNFT');

                const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid parent token id');

                const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                const childContractAddress = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
                assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

                const tokenId = await composableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0);
                assert(tokenId.eq(expectedTokenId), 'Invalid token id found when querying child token by index');
            });

            it('Should emit ReceiveChild event', async () => {
                // given:
                await sampleNFTInstance.from(alice)
                    .approve(composableTopDownInstance.contractAddress, expectedTokenId);
                const expectedEvent = 'ReceivedChild';

                // then:
                await assert.emit(
                    composableTopDownInstance.from(alice)
                        .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId),
                    expectedEvent);
            });

            it('Should emit ReceiveChild event arguments', async () => {
                // given:
                await sampleNFTInstance.from(alice)
                    .approve(composableTopDownInstance.contractAddress, expectedTokenId);
                const expectedEvent = 'ReceivedChild';

                // then:
                await assert.emitWithArgs(
                    composableTopDownInstance.from(alice)
                        .getChild(alice.address, expectedTokenId, sampleNFTInstance.contractAddress, expectedTokenId),
                    expectedEvent,
                    [
                        alice.address,
                        expectedTokenId,
                        sampleNFTInstance.contractAddress,
                        expectedTokenId
                    ]
                );
            });
        });

        describe('Composable Transfers', async () => {
            beforeEach(async () => {
                await safeTransferFromFirstToken();
            });

            it('Should revert when trying to transfer unapproved', async () => {
                const expectedRevertMessage = 'ComposableTopDown: _transferFrom msg.sender not approved';
                await assert.revertWith(composableTopDownInstance.transferFrom(alice.address, bob.address, expectedTokenId), expectedRevertMessage);
            });

            it('Should revert when trying to transfer from zero address', async () => {
                const expectedRevertMessage = 'ComposableTopDown: _transferFrom _from zero address';
                await assert.revertWith(composableTopDownInstance.transferFrom(zeroAddress, bob.address, expectedTokenId), expectedRevertMessage);
            });

            it('Should revert when trying to transfer from not owner', async () => {
                const expectedRevertMessage = 'ComposableTopDown: _transferFrom _from not owner';
                await assert.revertWith(composableTopDownInstance.transferFrom(nonUsed.address, bob.address, expectedTokenId), expectedRevertMessage);
            });

            it('Should revert when trying to transfer to zero address', async () => {
                const expectedRevertMessage = 'ComposableTopDown: _transferFrom _to zero address';
                await assert.revertWith(composableTopDownInstance.transferFrom(alice.address, zeroAddress, expectedTokenId), expectedRevertMessage);
            });

            it('Should successfully transferFrom to bob', async () => {
                // when:
                await composableTopDownInstance.from(alice).transferFrom(alice.address, bob.address, expectedTokenId);

                // then:
                const ownerOf = await composableTopDownInstance.ownerOf(expectedTokenId);
                assert(ownerOf === bob.address, 'Invalid owner');
            });

            it('Should successfully safeTransferFrom(3) to a contract', async () => {
                // given:
                const contractIERC721ReceiverOldInstance = await deployer.deploy(ContractIERC721ReceiverOld, {});

                const beforeTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                const beforeTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);

                // when:
                await composableTopDownInstance.from(alice).safeTransferFrom(alice.address, contractIERC721ReceiverOldInstance.contractAddress, expectedTokenId);
                // then:
                const afterTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                assert(afterTransferContractBalance.eq(beforeTransferContractBalance.add(1)), 'Invalid contract balanceOf');

                const afterTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);
                assert(afterTransferAliceBalance.eq(beforeTransferAliceBalance.sub(1)), 'Invalid alice balanceOf');

                const ownerOf = await composableTopDownInstance.ownerOf(expectedTokenId);
                assert(ownerOf === contractIERC721ReceiverOldInstance.contractAddress, 'Invalid token owner');
            });

            it('Should successfully safeTransferFrom(3) with bob used as intermediary', async () => {
                // given:
                const contractIERC721ReceiverOldInstance = await deployer.deploy(ContractIERC721ReceiverOld, {});
                await composableTopDownInstance.from(alice).approve(bob.address, expectedTokenId);

                const beforeTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                const beforeTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);

                // when:
                await composableTopDownInstance.from(bob).safeTransferFrom(alice.address, contractIERC721ReceiverOldInstance.contractAddress, expectedTokenId);
                // then:
                const afterTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                assert(afterTransferContractBalance.eq(beforeTransferContractBalance.add(1)), 'Invalid contract balanceOf');

                const afterTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);
                assert(afterTransferAliceBalance.eq(beforeTransferAliceBalance.sub(1)), 'Invalid alice balanceOf');

                const ownerOf = await composableTopDownInstance.ownerOf(expectedTokenId);
                assert(ownerOf === contractIERC721ReceiverOldInstance.contractAddress, 'Invalid token owner');
            });

            it('Should revert when trying to safeTransferFrom(3) to a contract with no IERC721Receivable', async () => {
                await assert.revert(composableTopDownInstance.from(alice).safeTransferFrom(alice.address, sampleNFTInstance.contractAddress, expectedTokenId));
            });

            it('Should revert when trying to safeTransferFrom(3) to a contract with != ERC721_RECEIVED_OLD', async () => {
                // given:
                const contractIERC721ReceiverNewInstance = await deployer.deploy(ContractIERC721ReceiverNew, {});
                const expectedRevertMessage = 'ComposableTopDown: safeTransferFrom(3) onERC721Received invalid return value';

                // then:
                await assert.revert(composableTopDownInstance.from(alice).safeTransferFrom(alice.address, contractIERC721ReceiverNewInstance.contractAddress, expectedTokenId), expectedRevertMessage);
            });

            it('Should successfully safeTransferFrom(4) to a contract', async () => {
                // given:
                const contractIERC721ReceiverOldInstance = await deployer.deploy(ContractIERC721ReceiverOld, {});
                const beforeTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                const beforeTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);

                // when:
                await composableTopDownInstance.from(alice)['safeTransferFrom(address,address,uint256,bytes)']
                    (alice.address,
                        contractIERC721ReceiverOldInstance.contractAddress,
                        expectedTokenId,
                        bytesFirstToken);
                // then:
                const afterTransferContractBalance = await composableTopDownInstance.balanceOf(contractIERC721ReceiverOldInstance.contractAddress);
                assert(afterTransferContractBalance.eq(beforeTransferContractBalance.add(1)), 'Invalid contract balanceOf');

                const afterTransferAliceBalance = await composableTopDownInstance.balanceOf(alice.address);
                assert(afterTransferAliceBalance.eq(beforeTransferAliceBalance.sub(1)), 'Invalid alice balanceOf');

                const ownerOf = await composableTopDownInstance.ownerOf(expectedTokenId);
                assert(ownerOf === contractIERC721ReceiverOldInstance.contractAddress, 'Invalid token owner');
            });

            it('Should revert when trying to safeTransferFrom(4) to a contract with no IERC721Receivable', async () => {
                await assert.revert(composableTopDownInstance.from(alice)['safeTransferFrom(address,address,uint256,bytes)']
                    (alice.address,
                        sampleNFTInstance.contractAddress,
                        expectedTokenId,
                        bytesFirstToken));
            });

            it('Should revert when trying to safeTransferFrom(4) to a contract with != ERC721_RECEIVED_OLD', async () => {
                // given:
                const contractIERC721ReceiverNewInstance = await deployer.deploy(ContractIERC721ReceiverNew, {});
                const expectedRevertMessage = 'ComposableTopDown: safeTransferFrom(4) onERC721Received invalid return value';

                // then:
                await assert.revert(composableTopDownInstance
                    .from(alice)
                ['safeTransferFrom(address,address,uint256,bytes)']
                    (alice.address,
                        contractIERC721ReceiverNewInstance.contractAddress,
                        expectedTokenId,
                        bytesFirstToken), expectedRevertMessage);
            });

            it('Should successfully return back token', async () => {
                // given:
                await composableTopDownInstance.from(alice).transferFrom(alice.address, bob.address, expectedTokenId);

                // when:
                await composableTopDownInstance
                    .from(bob)['transferChild(uint256,address,address,uint256)'](
                        expectedTokenId,
                        alice.address,
                        sampleNFTInstance.contractAddress,
                        expectedTokenId
                    );

                // then:
                const owner = await sampleNFTInstance.ownerOf(expectedTokenId);
                assert(owner === alice.address, 'Invalid owner address');

                const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContracts.eq(0), 'Invalid child contracts length');

                const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, expectedTokenId);
                assert(!childExists, 'child contract exists');
            });

            describe('safeTransferChild', async () => {
                const secondToken = 2;
                const secondChildTokenId = 2;
                const secondNFTHash = '0x5678';
                const bytesSecondToken = ethers.utils.hexZeroPad('0x2', 32);
                const expectedFirstTokenTotalChildTokens = 1;

                beforeEach(async () => {
                    await composableTopDownInstance.mint(alice.address);
                    await sampleNFTInstance.mint721(alice.address, secondNFTHash);

                    await sampleNFTInstance
                        .from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                            alice.address,
                            composableTopDownInstance.contractAddress,
                            secondToken,
                            bytesSecondToken);
                });

                it('Should have successfully transferred secondToken', async () => {
                    // then:
                    const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, secondChildTokenId);
                    assert(childExists, 'Composable does not own SampleNFT');

                    const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, secondChildTokenId);
                    assert(ownerOfChild.parentTokenId.eq(secondToken), 'Invalid parent token id');

                    const rootOwnerOfChild = await composableTopDownInstance.rootOwnerOfChild(sampleNFTInstance.contractAddress, secondChildTokenId);
                    assert(rootOwnerOfChild === aliceBytes32Address, 'Invalid root owner of second child token');

                    const totalChildContracts = await composableTopDownInstance.totalChildContracts(secondToken);
                    assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                    const childContractAddress = await composableTopDownInstance.childContractByIndex(secondToken, 0);
                    assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

                    const tokenId = await composableTopDownInstance.childTokenByIndex(secondToken, sampleNFTInstance.contractAddress, 0);
                    assert(tokenId.eq(secondToken), 'Invalid token id found when querying child token by index');

                    const totalChildTokens = await composableTopDownInstance.totalChildTokens(expectedTokenId, sampleNFTInstance.contractAddress);
                    assert(totalChildTokens.eq(expectedFirstTokenTotalChildTokens), 'Invalid total child tokens');
                });

                it('Should successfully safeTransferChild(5)', async () => {
                    // given:
                    const expectedRootOwnerOfChild = ethers.utils.hexZeroPad(alice.address, 32).toLowerCase();

                    // when:
                    await composableTopDownInstance
                        .from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                            secondToken,
                            composableTopDownInstance.contractAddress,
                            sampleNFTInstance.contractAddress,
                            secondToken,
                            bytesFirstToken
                        );

                    // then:
                    const contractByIndex = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
                    assert(contractByIndex === sampleNFTInstance.contractAddress, 'Invalid child contract by index');

                    const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, secondToken);
                    assert(childExists, 'SecondToken does not exist as child to SampleNFT');

                    const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                    assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                    const owner = await sampleNFTInstance.ownerOf(secondToken);
                    assert(owner === composableTopDownInstance.contractAddress, 'ComposableTopDown is not owner SecondToken');

                    const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, secondToken);
                    assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid SampleNFT child token 2 owner');

                    const rootOwnerOfChild = await composableTopDownInstance.rootOwnerOfChild(zeroAddress, secondToken);
                    assert(rootOwnerOfChild === expectedRootOwnerOfChild, 'Invalid rootOwnerOfChild token 2');
                });

                it('Should successfully safeTransferChild(4)', async () => {
                    // given:
                    const expectedRootOwnerOfChild = ethers.utils.hexZeroPad(alice.address, 32).toLowerCase();

                    // when:
                    await composableTopDownInstance
                        .from(alice)['safeTransferChild(uint256,address,address,uint256)'](
                            secondToken,
                            composableTopDownInstance.contractAddress,
                            sampleNFTInstance.contractAddress,
                            secondToken
                        );

                    // then:
                    const contractByIndex = await composableTopDownInstance.childContractByIndex(expectedTokenId, 0);
                    assert(contractByIndex === sampleNFTInstance.contractAddress, 'Invalid child contract by index');

                    const childExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, secondToken);
                    assert(childExists, 'SecondToken does not exist as child to SampleNFT');

                    const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                    assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                    const owner = await sampleNFTInstance.ownerOf(secondToken);
                    assert(owner === composableTopDownInstance.contractAddress, 'ComposableTopDown is not owner SecondToken');

                    const ownerOfChild = await composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, secondToken);
                    assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid SampleNFT child token 2 owner');

                    const rootOwnerOfChild = await composableTopDownInstance.rootOwnerOfChild(zeroAddress, secondToken);
                    assert(rootOwnerOfChild === expectedRootOwnerOfChild, 'Invalid rootOwnerOfChild token 2');
                });
            });
        });
    });


    describe('ERC20 Transfers', async () => {
        const mintTokensAmount = 1000;
        const name = 'SampleERC20';
        const symbol = 'S';
        const transferAmount = mintTokensAmount / 2;
        const secondTransferAmount = transferAmount / 2;

        beforeEach(async () => {
            sampleERC20Instance = await deployer.deploy(SampleERC20, {}, name, symbol);

            // mint
            await sampleERC20Instance.mint(alice.address, mintTokensAmount);

            await composableTopDownInstance.mint(alice.address);
        });

        it('Should have proper token balance', async () => {
            const aliceBalance = await sampleERC20Instance.balanceOf(alice.address);
            assert(aliceBalance.eq(mintTokensAmount), 'Invalid initial token balance');
        });

        it('Should transfer half the value from ERC20 to Composable', async () => {
            // when:
            await sampleERC20Instance
                .from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // then:
            const totalERC20Contracts = await composableTopDownInstance.totalERC20Contracts(expectedTokenId);
            assert(totalERC20Contracts.eq(1), 'Invalid total erc20 contracts');

            const balance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(balance.eq(transferAmount), 'Invalid Composable ERC20 balance');

            const erc20ContractByIndex = await composableTopDownInstance.erc20ContractByIndex(expectedTokenId, 0);
            assert(erc20ContractByIndex === sampleERC20Instance.contractAddress, 'Invalid erc20 contract by index');
        });

        it('Should transfer from Composable to bob via transferERC20', async () => {
            // given:
            await sampleERC20Instance
                .from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // when:
            await composableTopDownInstance
                .from(alice)
                .transferERC20(
                    expectedTokenId,
                    bob.address,
                    sampleERC20Instance.contractAddress,
                    secondTransferAmount
                );

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(secondTransferAmount), 'Invalid Composable ERC20 balance');

            const bobBalance = await sampleERC20Instance.balanceOf(bob.address);
            assert(bobBalance.eq(secondTransferAmount), 'Invalid bob balance');
        });

        it('Should transfer from Composable to bob via transferERC223', async () => {
            // given:
            await sampleERC20Instance
                .from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // when:
            await composableTopDownInstance
                .from(alice)
                .transferERC223(
                    expectedTokenId,
                    bob.address,
                    sampleERC20Instance.contractAddress,
                    secondTransferAmount,
                    bytesFirstToken
                );

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(secondTransferAmount), 'Invalid Composable ERC20 balance');

            const bobBalance = await sampleERC20Instance.balanceOf(bob.address);
            assert(bobBalance.eq(secondTransferAmount), 'Invalid bob balance');
        });

        it('Should transfer everything from Composable to bob via transferERC223', async () => {
            // given:
            await sampleERC20Instance
                .from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // when:
            await composableTopDownInstance
                .from(alice)
                .transferERC223(
                    expectedTokenId,
                    bob.address,
                    sampleERC20Instance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(0), 'Invalid Composable ERC20 balance');

            const bobBalance = await sampleERC20Instance.balanceOf(bob.address);
            assert(bobBalance.eq(transferAmount), 'Invalid bob balance');

            const totalERC20Contracts = await composableTopDownInstance.totalERC20Contracts(expectedTokenId);
            assert(totalERC20Contracts.eq(0), 'Invalid total erc20 contracts');
        });

        it('Should transfer 0 from Composable to bob via transferERC223', async () => {
            // given:
            await sampleERC20Instance
                .from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

            // when:
            await composableTopDownInstance
                .from(alice)
                .transferERC223(
                    expectedTokenId,
                    bob.address,
                    sampleERC20Instance.contractAddress,
                    0,
                    bytesFirstToken
                );

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(transferAmount), 'Invalid Composable ERC20 balance');

            const bobBalance = await sampleERC20Instance.balanceOf(bob.address);
            assert(bobBalance.eq(0), 'Invalid bob balance');
        });

        it('Should get tokens using getERC20', async () => {
            // given:
            await sampleERC20Instance.from(alice).approve(composableTopDownInstance.contractAddress, transferAmount);

            // when:
            await composableTopDownInstance.from(alice)
                .getERC20(
                    alice.address,
                    expectedTokenId,
                    sampleERC20Instance.contractAddress,
                    transferAmount);

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(transferAmount), 'Invalid Composable ERC20 balance');

            const erc20ComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
            assert(erc20ComposableBalance.eq(composableBalance), 'Invalid ERC20 Composable balance');
        });

        it('Should get 0 tokens using getERC20', async () => {
            // given:
            await sampleERC20Instance.from(alice).approve(composableTopDownInstance.contractAddress, transferAmount);

            // when:
            await composableTopDownInstance.from(alice)
                .getERC20(
                    alice.address,
                    expectedTokenId,
                    sampleERC20Instance.contractAddress,
                    0);

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(0), 'Invalid Composable ERC20 balance');

            const erc20ComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
            assert(erc20ComposableBalance.eq(0), 'Invalid ERC20 Composable balance');
        });

        it('Should revert getERC20 with invalid contract address', async () => {
            const expectedRevertMessage = 'ComposableTopDown: getERC20 allowance failed';
            await assert.revertWith(
                composableTopDownInstance
                    .from(bob)
                    .getERC20(
                        alice.address,
                        expectedTokenId,
                        composableTopDownInstance.contractAddress,
                        transferAmount),
                expectedRevertMessage);
        });

        it('Should revert getERC20 allowed address not enough amount', async () => {
            const expectedRevertMessage = 'ComposableTopDown: getERC20 value greater than remaining';
            // when:
            await assert.revert(
                composableTopDownInstance
                    .from(bob)
                    .getERC20(
                        alice.address,
                        expectedTokenId,
                        sampleERC20Instance.contractAddress,
                        transferAmount),
                expectedRevertMessage);
        });

        it('Should get tokens using getERC20, using bob as approved sender', async () => {
            // given:
            await sampleERC20Instance.from(alice).approve(bob.address, transferAmount);
            await sampleERC20Instance.from(alice).approve(composableTopDownInstance.contractAddress, transferAmount);

            // when:
            await composableTopDownInstance.from(bob)
                .getERC20(
                    alice.address,
                    expectedTokenId,
                    sampleERC20Instance.contractAddress,
                    transferAmount);

            // then:
            const composableBalance = await composableTopDownInstance
                .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
            assert(composableBalance.eq(transferAmount), 'Invalid Composable ERC20 balance');

            const erc20ComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
            assert(erc20ComposableBalance.eq(composableBalance), 'Invalid ERC20 Composable balance');
        });
    });

    describe('Multi Token tests', async () => {
        const mintTokensAmount = 1000;
        const transferAmount = 500;
        const totalTokens = 5;
        const mintedPerNFT = 3;

        beforeEach(async () => {
            await composableTopDownInstance.mint(alice.address);
        });

        it('Should return proper totals after addition and removal', async () => {
            // given:
            const [nfts, erc20s] = await setUpTestTokens(totalTokens, totalTokens);

            // when:

            // transfer erc20s
            for (let i = 0; i < erc20s.length; i++) {
                await erc20s[i].mint(alice.address, mintTokensAmount);
                await erc20s[i].from(alice)['transfer(address,uint256,bytes)'](
                    composableTopDownInstance.contractAddress,
                    transferAmount,
                    bytesFirstToken
                );

                const balance = await composableTopDownInstance.balanceOfERC20(expectedTokenId, erc20s[i].contractAddress);
                assert(balance.eq(transferAmount), `Invalid balanceOfERC20 on Token ${i}`);
            }

            const totalERC20TokensAdded = await composableTopDownInstance.totalERC20Contracts(expectedTokenId);
            assert(totalERC20TokensAdded.eq(totalTokens), 'Invalid Alice total ERC20 cotracts');

            // transfer nfts
            for (let i = 0; i < nfts.length; i++) {
                for (let j = 0; j < mintedPerNFT; j++) {
                    await nfts[i].mint721(alice.address, `${i}${j}`);
                    const mintedTokenId = j + 1;
                    await nfts[i].from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                        alice.address,
                        composableTopDownInstance.contractAddress,
                        mintedTokenId,
                        bytesFirstToken);
                }
                const nftChildren = await composableTopDownInstance.totalChildTokens(expectedTokenId, nfts[i].contractAddress);
                assert(nftChildren.eq(mintedPerNFT), `Invalid nft children for ${i}`);
            }

            const totalChildContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);
            assert(totalChildContracts.eq(totalTokens), 'Invalid child tokens contracts count');

            // remove erc20s
            let tokenERC20Contracts = await composableTopDownInstance.totalERC20Contracts(expectedTokenId);

            for (let i = 0; i < tokenERC20Contracts; i++) {
                const tokenAddress = await composableTopDownInstance.erc20ContractByIndex(expectedTokenId, i);
                const balance = await composableTopDownInstance.balanceOfERC20(expectedTokenId, tokenAddress);

                await composableTopDownInstance.from(alice).transferERC20(expectedTokenId, alice.address, tokenAddress, balance);
                const nextNumTotalERC20Contracts = await composableTopDownInstance.totalERC20Contracts(expectedTokenId);

                assert(nextNumTotalERC20Contracts.eq(tokenERC20Contracts.sub(1)), `Expected ${tokenERC20Contracts - 1} tokenContracts but got ${nextNumTotalERC20Contracts}`);
                tokenERC20Contracts = nextNumTotalERC20Contracts;
            }

            // remove nfts
            let totalNFTsContracts = await composableTopDownInstance.totalChildContracts(expectedTokenId);

            for (let i = totalNFTsContracts; i > 0; i--) {
                const contractAddress = await composableTopDownInstance.childContractByIndex(expectedTokenId, i - 1);
                let totalChildTokens = await composableTopDownInstance.totalChildTokens(expectedTokenId, contractAddress);

                for (let j = totalChildTokens; j > 0; j--) {
                    const childTokenId = await composableTopDownInstance.childTokenByIndex(expectedTokenId, contractAddress, j - 1);
                    await composableTopDownInstance.from(alice)['safeTransferChild(uint256,address,address,uint256)'](
                        expectedTokenId,
                        alice.address,
                        contractAddress,
                        childTokenId
                    );

                    const totalChildTokensAfterRemoval = await composableTopDownInstance.totalChildTokens(expectedTokenId, contractAddress);
                    assert(totalChildTokensAfterRemoval.eq(j - 1), 'Invalid totalChildTokens after removal');
                }

                const totalChildContractsAfterRemoval = await composableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContractsAfterRemoval.eq(i - 1), 'Invalid totalChildContracts after removal');
            }
        });
    });

    describe('Between Composables / Gas Usages', async () => {
        const bytesSecondToken = ethers.utils.hexZeroPad('0x2', 32);

        describe('5 NFTs from 1 type', async () => {
            beforeEach(async () => {
                sampleNFTInstance = await deployer.deploy(SampleNFT, {});

                await composableTopDownInstance.mint(alice.address);
                await composableTopDownInstance.mint(bob.address);

                for (let i = 1; i <= 5; i++) {
                    await sampleNFTInstance.mint721(alice.address, i.toString());
                    await sampleNFTInstance
                        .from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                            alice.address,
                            composableTopDownInstance.contractAddress,
                            i,
                            bytesFirstToken);
                }
            });


            it('Should transfer to bob 5 1 Type NFTs', async () => {
                // when:
                for (let i = 1; i <= 5; i++) {
                    await composableTopDownInstance
                        .from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                            expectedTokenId,
                            composableTopDownInstance.contractAddress,
                            sampleNFTInstance.contractAddress,
                            i,
                            bytesSecondToken
                        );
                }
            });
        });

        describe('5 different NFTs', async () => {
            beforeEach(async () => {
                await composableTopDownInstance.mint(alice.address);
                await composableTopDownInstance.mint(bob.address);

                const [nfts, _] = await setUpTestTokens(5, 0);
                nftInstances = nfts;

                for (let i = 0; i < nftInstances.length; i++) {
                    await nftInstances[i].mint721(alice.address, i.toString());
                    await nftInstances[i].from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                        alice.address,
                        composableTopDownInstance.contractAddress,
                        1,
                        bytesFirstToken);
                }
            });

            it('Should successfully transfer 5 NFTs to bob', async () => {
                for (let i = 0; i < nftInstances.length; i++) {
                    await composableTopDownInstance
                        .from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                            expectedTokenId,
                            composableTopDownInstance.contractAddress,
                            nftInstances[i].contractAddress,
                            1,
                            bytesSecondToken
                        );
                }
            });
        });
    });

    describe('Between ComposableTopDowns / Gas Usages', async () => {
        beforeEach(async () => {
            secondComposableTopDownInstance = await deployer.deploy(
                ComposableTopDown,
                {}
            );

            await composableTopDownInstance.mint(alice.address);
            await secondComposableTopDownInstance.mint(bob.address);
        });

        describe('NFTs', async () => {
            beforeEach(async () => {
                sampleNFTInstance = await deployer.deploy(SampleNFT, {});
                // mint
                await sampleNFTInstance.mint721(alice.address, NFTHash);

                await safeTransferFromFirstToken();
            });

            it('Should successfully transfer tokenId to ComposableTopDown', async () => {
                // given:
                const expectedRootOwnerOfChild = ethers.utils.hexZeroPad(secondComposableTopDownInstance.contractAddress, 32).toLowerCase();

                // when:
                await composableTopDownInstance.from(alice)
                    .transferFrom(alice.address, secondComposableTopDownInstance.contractAddress, expectedTokenId);

                // then:
                const owner = await composableTopDownInstance.rootOwnerOfChild(sampleNFTInstance.contractAddress, expectedTokenId);
                assert(owner === expectedRootOwnerOfChild, 'Invalid owner');
            });

            it.only('Should successfully transfer ERC998 to SecondComposable', async () => {
                // given:
                const expectedRootOwnerOf = ethers.utils.hexZeroPad(secondComposableTopDownInstance.contractAddress, 32).toLowerCase();
                const expectedSecondComposableRootOwnerOf = ethers.utils.hexZeroPad(bob.address, 32).toLowerCase();

                await composableTopDownInstance.from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                    alice.address,
                    secondComposableTopDownInstance.contractAddress,
                    expectedTokenId,
                    bytesFirstToken
                );

                const owner = await composableTopDownInstance.ownerOf(expectedTokenId);
                assert(owner === secondComposableTopDownInstance.contractAddress, 'Invalid address');

                const totalChildContracts = await secondComposableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContracts.eq(1), 'Invalid total child contracts');

                const rootOwnerOf = await composableTopDownInstance.rootOwnerOf(expectedTokenId);
                assert(rootOwnerOf === expectedRootOwnerOf, 'Invalid first composable rootOwnerOf');
                const ownerOf = await secondComposableTopDownInstance.rootOwnerOfChild(composableTopDownInstance.contractAddress, expectedTokenId);
                assert(ownerOf === expectedSecondComposableRootOwnerOf, 'Invalid second composable rootOwnerOfChild');
            });

            it('Should successfully transfer NFT from ComposableTopDown to ComposableTopDown', async () => {
                // given:
                const expectedFirstComposableChildContracts = 0;
                const expectedSecondComposableChildContracts = 1;
                // when:
                await composableTopDownInstance.from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                    expectedTokenId,
                    secondComposableTopDownInstance.contractAddress,
                    sampleNFTInstance.contractAddress,
                    firstChildTokenId,
                    bytesFirstToken
                );

                // then:
                // First Composable
                const composableFirstChildContracts = await composableTopDownInstance.totalChildContracts(firstChildTokenId);
                assert(composableFirstChildContracts.eq(expectedFirstComposableChildContracts), 'Invalid First Composable Child Contracts');

                const firstComposableChildExists = await composableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(!firstComposableChildExists, 'First Composable Child exists');

                await assert.revertWith(composableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId), 'ComposableTopDown: ownerOfChild not found');

                await assert.revertWith(composableTopDownInstance.childContractByIndex(expectedTokenId, 0), 'EnumerableSet: index out of bounds');

                await assert.revertWith(composableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0), 'EnumerableSet: index out of bounds');

                const firstComposableTotalChildTokens = await composableTopDownInstance.totalChildTokens(expectedTokenId, sampleNFTInstance.contractAddress);
                assert(firstComposableTotalChildTokens.eq(0), 'Invalid First Composable Total Child Tokens');

                // Second Composable:
                const childExists = await secondComposableTopDownInstance.childExists(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(childExists, 'Composable does not own SampleNFT');

                const ownerOfChild = await secondComposableTopDownInstance.ownerOfChild(sampleNFTInstance.contractAddress, firstChildTokenId);
                assert(ownerOfChild.parentTokenId.eq(expectedTokenId), 'Invalid parent token id');

                const totalChildContracts = await secondComposableTopDownInstance.totalChildContracts(expectedTokenId);
                assert(totalChildContracts.eq(expectedSecondComposableChildContracts), 'Invalid total child contracts');

                const childContractAddress = await secondComposableTopDownInstance.childContractByIndex(expectedTokenId, 0);
                assert(childContractAddress === sampleNFTInstance.contractAddress, 'Invalid child contract address');

                const tokenId = await secondComposableTopDownInstance.childTokenByIndex(expectedTokenId, sampleNFTInstance.contractAddress, 0);
                assert(tokenId.eq(expectedTokenId), 'Invalid token id found when querying child token by index');

                const secondComposableTotalChildTokens = await secondComposableTopDownInstance.totalChildTokens(expectedTokenId, sampleNFTInstance.contractAddress);
                assert(secondComposableTotalChildTokens.eq(1), 'Invalid First Composable Total Child Tokens');

                // SampleNFT
                const owner = await sampleNFTInstance.ownerOf(expectedTokenId);
                assert(owner === secondComposableTopDownInstance.contractAddress, 'Invalid NFT Owner');
            });

            describe('Transfer 5 NFTs to another Composable token id', async () => {
                beforeEach('Mint additional 4 NFTs', async () => {
                    for (let i = 1; i <= 4; i++) {
                        await sampleNFTInstance.mint721(alice.address, i.toString());
                        await sampleNFTInstance
                            .from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                                alice.address,
                                composableTopDownInstance.contractAddress,
                                i + 1,
                                bytesFirstToken);
                    }
                });

                it('Should successfully transfer 5 NFTs', async () => {
                    // when:
                    for (let i = 1; i <= 5; i++) {
                        await composableTopDownInstance.from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                            expectedTokenId,
                            secondComposableTopDownInstance.contractAddress,
                            sampleNFTInstance.contractAddress,
                            i,
                            bytesFirstToken
                        );
                    }
                    // then:
                    const firstComposableTotalChildTokens = await composableTopDownInstance.totalChildTokens(expectedTokenId, sampleNFTInstance.contractAddress);
                    assert(firstComposableTotalChildTokens.eq(0), 'Invalid First Composable Total Child Tokens');

                    const secondComposableTotalChildTokens = await secondComposableTopDownInstance.totalChildTokens(expectedTokenId, sampleNFTInstance.contractAddress);
                    assert(secondComposableTotalChildTokens.eq(5), 'Invalid First Composable Total Child Tokens');
                });
            });
        });

        describe('Transfer ERC20 from ComposableTopDown to ComposableTopDown', async () => {
            const mintTokensAmount = 1000;
            const name = 'SampleERC20';
            const symbol = 'S';
            const transferAmount = mintTokensAmount / 2;
            const secondTransferAmount = transferAmount / 2;

            beforeEach(async () => {
                sampleERC20Instance = await deployer.deploy(SampleERC20, {}, name, symbol);

                // mint
                await sampleERC20Instance.mint(alice.address, mintTokensAmount);

                // transfer to first composable
                await sampleERC20Instance
                    .from(alice)['transfer(address,uint256,bytes)'](
                        composableTopDownInstance.contractAddress,
                        transferAmount,
                        bytesFirstToken
                    );
            });

            it('Should successfully transferERC20 half the amount', async () => {
                // when:
                await composableTopDownInstance.from(alice)
                    .transferERC20(
                        expectedTokenId,
                        secondComposableTopDownInstance.contractAddress,
                        sampleERC20Instance.contractAddress,
                        secondTransferAmount
                    );
                const firstComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
                const secondComposableBalance = await sampleERC20Instance.balanceOf(secondComposableTopDownInstance.contractAddress);

                assert(firstComposableBalance.eq(secondComposableBalance), 'Invalid balances');
            });

            it('Should successfully transferERC20 everything', async () => {
                // when:
                await composableTopDownInstance.from(alice)
                    .transferERC20(
                        expectedTokenId,
                        secondComposableTopDownInstance.contractAddress,
                        sampleERC20Instance.contractAddress,
                        transferAmount
                    );

                const firstComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
                const secondComposableBalance = await sampleERC20Instance.balanceOf(secondComposableTopDownInstance.contractAddress);

                assert(firstComposableBalance.eq(0), 'Invalid first composable balance');
                assert(secondComposableBalance.eq(transferAmount), 'Invalid second composable balance');
            });

            it('Should successfully transferERC223 half the amount', async () => {
                // when:
                await composableTopDownInstance.from(alice)
                    .transferERC223(
                        expectedTokenId,
                        secondComposableTopDownInstance.contractAddress,
                        sampleERC20Instance.contractAddress,
                        secondTransferAmount,
                        bytesFirstToken
                    );

                const firstComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
                const secondComposableBalance = await sampleERC20Instance.balanceOf(secondComposableTopDownInstance.contractAddress);

                assert(firstComposableBalance.eq(secondComposableBalance), 'Invalid balances');
            });

            it('Should successfully transferERC223 everything', async () => {
                // when:
                await composableTopDownInstance.from(alice)
                    .transferERC223(
                        expectedTokenId,
                        secondComposableTopDownInstance.contractAddress,
                        sampleERC20Instance.contractAddress,
                        transferAmount,
                        bytesFirstToken
                    );
                const firstComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
                const secondComposableBalance = await sampleERC20Instance.balanceOf(secondComposableTopDownInstance.contractAddress);

                assert(firstComposableBalance.eq(0), 'Invalid first composable balance');
                assert(secondComposableBalance.eq(transferAmount), 'Invalid second composable balance');
            });

            it('Should successfully transferERC223 everything on 5 portions', async () => {
                // given:
                const portion = transferAmount / 5;

                // when:
                for (let i = 0; i < 5; i++) {
                    await composableTopDownInstance.from(alice)
                        .transferERC223(
                            expectedTokenId,
                            secondComposableTopDownInstance.contractAddress,
                            sampleERC20Instance.contractAddress,
                            portion,
                            bytesFirstToken
                        );
                }

                const firstComposableBalance = await sampleERC20Instance.balanceOf(composableTopDownInstance.contractAddress);
                const secondComposableBalance = await sampleERC20Instance.balanceOf(secondComposableTopDownInstance.contractAddress);

                assert(firstComposableBalance.eq(0), 'Invalid first composable balance');
                assert(secondComposableBalance.eq(transferAmount), 'Invalid second composable balance');

                const firstComposableTokenIdBalance = await composableTopDownInstance
                    .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
                assert(firstComposableTokenIdBalance.eq(0), 'Invalid first composable tokenId balance');

                const secondComposableTokenIdBalance = await secondComposableTopDownInstance
                    .balanceOfERC20(expectedTokenId, sampleERC20Instance.contractAddress);
                assert(secondComposableTokenIdBalance.eq(transferAmount), 'Invalid second composable tokenId balance');
            });
        });
    });

    describe('Multiple TopDowns scenario', async () => {
        const bytesFirst = ethers.utils.hexZeroPad('0x1', 32);
        const bytesSecond = ethers.utils.hexZeroPad('0x2', 32);
        const bytesThird = ethers.utils.hexZeroPad('0x3', 32);

        beforeEach(async () => {
            // Introduce ComposableTopDown, which represents accounts, (e.g. alice and bob have accounts)
            // Introduce ComposableTopDown, which represents characters
            // Introduce ComposableTopDown, which represents weapons (e.g. axes, swords, etc.)
            // Introduce ERC721, which represents enchantments
            // Accounts can have characters, characters can have weapons, weapons can have enchantments

            // Create alice and bob accounts
            erc998Accounts = await deployer.deploy(
                ComposableTopDown,
                {}
            );
            await erc998Accounts.mint(alice.address);
            await erc998Accounts.mint(bob.address);

            // Create two characters
            erc998Characters = await deployer.deploy(
                ComposableTopDown,
                {}
            );
            await erc998Characters.mint(owner.signer.address); // first character
            await erc998Characters.mint(owner.signer.address); // second character

            erc998Weapons = await deployer.deploy(
                ComposableTopDown,
                {}
            );
            await erc998Weapons.mint(owner.signer.address); // id 1
            await erc998Weapons.mint(owner.signer.address); // id 2
            await erc998Weapons.mint(owner.signer.address); // id 3
        });

        it('Should successfully populate accounts and then showcase how the deepest level NFT is transferred', async () => {
            erc721Enchantments = await deployer.deploy(SampleNFT, {});

            // Mint enchantments
            await erc721Enchantments.mint721(owner.signer.address, 'enchantment1'); // id 1
            await erc721Enchantments.mint721(owner.signer.address, 'enchantment2'); // id 2
            await erc721Enchantments.mint721(owner.signer.address, 'enchantment3'); // id 3
            await erc721Enchantments.mint721(owner.signer.address, 'enchantment4'); // id 4

            // Transfer 1,2 to first weapon, 3 to second weapon, 4 to third weapon
            await erc721Enchantments['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Weapons.contractAddress,
                1,
                bytesFirst);
            await erc721Enchantments['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Weapons.contractAddress,
                2,
                bytesFirst);
            await erc721Enchantments['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Weapons.contractAddress,
                3,
                bytesSecond);

            await erc721Enchantments['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Weapons.contractAddress,
                4,
                bytesThird);

            // Transfer 1,2 Weapons to First Character, 3 to Second Character
            await erc998Weapons['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Characters.contractAddress,
                1,
                bytesFirst);
            await erc998Weapons['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Characters.contractAddress,
                2,
                bytesFirst);
            await erc998Weapons['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Characters.contractAddress,
                3,
                bytesSecond);

            // Transfer Characters to Accounts
            await erc998Characters['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Accounts.contractAddress,
                1,
                bytesFirst);
            await erc998Characters['safeTransferFrom(address,address,uint256,bytes)'](
                owner.signer.address,
                erc998Accounts.contractAddress,
                2,
                bytesSecond);

            const aliceAccountChildContracts = await erc998Accounts.totalChildContracts(1);
            assert(aliceAccountChildContracts.eq(1), 'Invalid alice child contracts');

            const bobAccountChildContracts = await erc998Accounts.totalChildContracts(2);
            assert(bobAccountChildContracts.eq(1), 'Invalid bob child contracts');

            // How to transfer an enchantment from FirstWeapon to SecondWeapon?
            // Transfer Character
            await erc998Accounts.from(alice)['safeTransferChild(uint256,address,address,uint256)'](
                1,
                alice.address,
                erc998Characters.contractAddress,
                1
            );

            // Transfer Weapon
            await erc998Characters.from(alice)['safeTransferChild(uint256,address,address,uint256)'](
                1,
                alice.address,
                erc998Weapons.contractAddress,
                1
            );

            // enchantments before transfer
            const secondWeaponEnchantmentsBeforeTransfer = await erc998Weapons.totalChildTokens(2, erc721Enchantments.contractAddress);

            // Transfer Enchantment
            await erc998Weapons.from(alice)['safeTransferChild(uint256,address,address,uint256,bytes)'](
                1,
                erc998Weapons.contractAddress,
                erc721Enchantments.contractAddress,
                1,
                bytesSecond // transfer to second weapon
            );

            const secondWeaponEnchantmentsAfterTransfer = await erc998Weapons.totalChildTokens(2, erc721Enchantments.contractAddress);
            assert(secondWeaponEnchantmentsAfterTransfer.eq(secondWeaponEnchantmentsBeforeTransfer.add(1)),
                'Invalid total child contracts');
        });
    });

    async function setUpTestTokens(nftCount, erc20Count) {
        let nfts = [];
        let erc20s = [];
        for (let i = 0; i < nftCount; i++) {
            nfts.push(await deployer.deploy(SampleNFT, {}));
        }

        for (let i = 0; i < erc20Count; i++) {
            erc20s.push(await deployer.deploy(SampleERC20, {}, i.toString(), i.toString()));
        }

        return [nfts, erc20s];
    }

    async function safeTransferFromFirstToken() {
        await sampleNFTInstance
            .from(alice)['safeTransferFrom(address,address,uint256,bytes)'](
                alice.address,
                composableTopDownInstance.contractAddress,
                expectedTokenId,
                bytesFirstToken);
    }
});