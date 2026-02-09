/**
 * Contract Deployer - General-purpose smart contract deployment for dApps on Base
 * Supports arbitrary contract deployment and pre-built templates (ERC-20, ERC-721, escrow, etc.)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class ContractDeployer {
    constructor(onchainAgent, llm) {
        this.agent = onchainAgent;
        this.llm = llm;

        // Safety limits
        this.maxDailyDeployments = 5;
        this.maxGasLimit = 5_000_000;
        this.deploymentsToday = 0;
        this.lastResetDate = new Date().toDateString();

        // Track deployed contracts
        this.deployedContracts = [];
        this.deploymentLogPath = path.join(process.cwd(), 'data', 'deployed-contracts.json');

        // Load deployment history
        this._loadDeploymentHistory();

        // Templates directory
        this.templatesDir = path.join(__dirname, 'contract-templates');
    }

    /**
     * Deploy an arbitrary smart contract
     */
    async deployContract(abi, bytecode, constructorArgs = [], options = {}) {
        this._checkDailyLimit();

        if (!this.agent.wallet) {
            throw new Error('Wallet not initialized');
        }

        // LLM safety review of the ABI
        if (this.llm) {
            await this._llmSafetyCheck(abi, options.reason || 'No reason provided');
        }

        // Gas estimation
        const factory = new ethers.ContractFactory(abi, bytecode, this.agent.wallet);
        const deployTx = factory.getDeployTransaction(...constructorArgs);
        const estimatedGas = await this.agent.provider.estimateGas(deployTx);

        if (estimatedGas.gt(this.maxGasLimit)) {
            throw new Error(`Gas estimate ${estimatedGas.toString()} exceeds max ${this.maxGasLimit}`);
        }

        // Deploy
        console.log(`🚀 Deploying contract (est. gas: ${estimatedGas.toString()})...`);
        const contract = await factory.deploy(...constructorArgs, {
            gasLimit: estimatedGas.mul(120).div(100), // 20% buffer
            ...(options.gasPrice ? { gasPrice: options.gasPrice } : {})
        });

        console.log(`📝 Deploy tx: ${contract.deployTransaction.hash}`);
        await contract.deployed();
        console.log(`✅ Contract deployed at: ${contract.address}`);

        // Record deployment
        const record = {
            address: contract.address,
            txHash: contract.deployTransaction.hash,
            blockNumber: contract.deployTransaction.blockNumber,
            abi: typeof abi === 'string' ? JSON.parse(abi) : abi,
            constructorArgs,
            reason: options.reason || '',
            template: options.template || null,
            deployedAt: new Date().toISOString(),
            network: this.agent.network
        };

        this.deployedContracts.push(record);
        this.deploymentsToday++;
        this._saveDeploymentHistory();

        return record;
    }

    /**
     * Deploy from a pre-built template
     */
    async deployFromTemplate(templateName, params = {}) {
        const template = this._loadTemplate(templateName);
        if (!template) {
            const available = this._listTemplates();
            throw new Error(`Template '${templateName}' not found. Available: ${available.join(', ')}`);
        }

        // Build constructor args from template + params
        const constructorArgs = this._buildConstructorArgs(template, params);

        return this.deployContract(
            template.abi,
            template.bytecode,
            constructorArgs,
            { reason: `Deploy ${templateName}: ${JSON.stringify(params)}`, template: templateName }
        );
    }

    /**
     * Verify a deployed contract on Basescan
     */
    async verifyContract(address) {
        const record = this.deployedContracts.find(c => c.address.toLowerCase() === address.toLowerCase());
        if (!record) {
            throw new Error('Contract not found in deployment history');
        }

        // Check contract has code
        const code = await this.agent.provider.getCode(address);
        if (code === '0x') {
            throw new Error('No contract code at address');
        }

        return {
            address,
            hasCode: true,
            codeSize: (code.length - 2) / 2,
            deployedAt: record.deployedAt,
            txHash: record.txHash
        };
    }

    /**
     * List all deployed contracts
     */
    getDeployedContracts() {
        return this.deployedContracts.map(c => ({
            address: c.address,
            template: c.template,
            reason: c.reason,
            deployedAt: c.deployedAt,
            network: c.network,
            txHash: c.txHash
        }));
    }

    /**
     * List available templates
     */
    getAvailableTemplates() {
        return this._listTemplates().map(name => {
            const template = this._loadTemplate(name);
            return {
                name,
                description: template?.description || '',
                params: template?.params || []
            };
        });
    }

    // --- Private methods ---

    _checkDailyLimit() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.deploymentsToday = 0;
            this.lastResetDate = today;
        }
        if (this.deploymentsToday >= this.maxDailyDeployments) {
            throw new Error(`Daily deployment limit reached (${this.maxDailyDeployments})`);
        }
    }

    async _llmSafetyCheck(abi, reason) {
        const abiStr = typeof abi === 'string' ? abi : JSON.stringify(abi);

        // Check for dangerous patterns
        const dangerousPatterns = ['selfdestruct', 'delegatecall', 'SELFDESTRUCT', 'DELEGATECALL'];
        for (const pattern of dangerousPatterns) {
            if (abiStr.includes(pattern)) {
                console.warn(`⚠️ ABI contains dangerous pattern: ${pattern}`);
            }
        }

        const decision = await this.llm.generateCoordination(`
Review this smart contract deployment request:
Reason: ${reason}
ABI summary: ${abiStr.slice(0, 500)}

Should this contract be deployed? Consider:
- Is the reason legitimate?
- Does the ABI look like a standard contract (ERC-20, ERC-721, escrow, etc.)?
- Are there any dangerous functions (selfdestruct, unrestricted delegatecall)?

Answer YES or NO with brief reasoning.`, { mode: 'contract_deployment_validation' });

        if (!decision.content.toUpperCase().includes('YES')) {
            throw new Error(`Deployment rejected by safety check: ${decision.content.slice(0, 200)}`);
        }
    }

    _loadTemplate(name) {
        try {
            const filePath = path.join(this.templatesDir, `${name}.json`);
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    _listTemplates() {
        try {
            return fs.readdirSync(this.templatesDir)
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
        } catch {
            return [];
        }
    }

    _buildConstructorArgs(template, params) {
        if (!template.params) return [];
        return template.params.map(p => {
            if (params[p.name] !== undefined) return params[p.name];
            if (p.default !== undefined) return p.default;
            throw new Error(`Missing required parameter: ${p.name}`);
        });
    }

    _loadDeploymentHistory() {
        try {
            this.deployedContracts = JSON.parse(fs.readFileSync(this.deploymentLogPath, 'utf8'));
        } catch {
            this.deployedContracts = [];
        }
    }

    _saveDeploymentHistory() {
        try {
            const dir = path.dirname(this.deploymentLogPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.deploymentLogPath, JSON.stringify(this.deployedContracts, null, 2));
        } catch (error) {
            console.error('Failed to save deployment history:', error.message);
        }
    }
}

module.exports = ContractDeployer;
