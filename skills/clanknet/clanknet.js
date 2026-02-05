/**
 * Clanknet (CLANKNET) Token Integration Skill
 *
 * Enables agents to interact with the CLANKNET token ecosystem
 * Contract: 0x623693BefAECf61484e344fa272e9A8B82d9BB07 on Base
 *
 * Features:
 * - Token balance checking
 * - Trading via Uniswap V4
 * - x402 payment protocol
 * - Agent marketplace integration
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Configuration
const CLANKNET_ADDRESS = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
const BASE_RPC = 'https://base.publicnode.com';
const BASE_CHAIN_ID = 8453;
const CLANKNET_API = 'https://clanknet.ai/api';

// Uniswap V4 Configuration
const UNISWAP_V4_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

// ERC-20 ABI (minimal)
const CLANKNET_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

class ClanknetSkill {
  constructor(privateKey = null) {
    this.provider = new ethers.providers.JsonRpcProvider(BASE_RPC);

    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.clankContract = new ethers.Contract(CLANKNET_ADDRESS, CLANKNET_ABI, this.wallet);
    } else {
      this.clankContract = new ethers.Contract(CLANKNET_ADDRESS, CLANKNET_ABI, this.provider);
    }

    this.agentId = null;
    this.x402Enabled = false;
  }

  /**
   * Initialize agent with ERC-8004 identity
   */
  async initAgent(agentId) {
    this.agentId = agentId;
    this.x402Enabled = true;
    console.log(`✅ Clanknet skill initialized for Agent ${agentId}`);

    // Special pricing for founding agents
    if (agentId === '1396') {
      console.log('🎉 Founding agent detected - special pricing enabled!');
    }
  }

  /**
   * Get CLANKNET token balance
   */
  async getBalance(address = null) {
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet configured');
    }

    const balance = await this.clankContract.balanceOf(targetAddress);
    const decimals = await this.clankContract.decimals();
    const formatted = ethers.utils.formatUnits(balance, decimals);

    return {
      raw: balance.toString(),
      formatted: formatted,
      symbol: 'CLANKNET'
    };
  }

  /**
   * Transfer CLANKNET tokens
   */
  async transfer(to, amount) {
    if (!this.wallet) {
      throw new Error('Wallet required for transfers');
    }

    const decimals = await this.clankContract.decimals();
    const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);

    const tx = await this.clankContract.transfer(to, amountWei);
    const receipt = await tx.wait();

    return {
      hash: receipt.transactionHash,
      from: this.wallet.address,
      to: to,
      amount: amount,
      status: receipt.status === 1 ? 'success' : 'failed'
    };
  }

  /**
   * Get current CLANKNET price from Uniswap V4
   */
  async getPrice() {
    try {
      const response = await axios.get(`${CLANKNET_API}/price/clanknet`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch CLANKNET price:', error.message);

      // Fallback to on-chain price discovery
      return {
        price: 'N/A',
        source: 'unavailable',
        message: 'Price API temporarily unavailable'
      };
    }
  }

  /**
   * x402 Payment Protocol - Pay for services with CLANKNET
   */
  async payForService(service, metadata = {}) {
    if (!this.wallet) {
      throw new Error('Wallet required for x402 payments');
    }

    try {
      // Attempt service request
      const response = await axios.post(`${CLANKNET_API}/agent/x402`, {
        agentId: this.agentId || 'anonymous',
        wallet: this.wallet.address,
        service: service,
        metadata: metadata
      });

      if (response.status === 200) {
        return {
          success: true,
          service: service,
          receipt: response.data.receipt
        };
      }
    } catch (error) {
      // Handle 402 Payment Required
      if (error.response && error.response.status === 402) {
        const payment = error.response.data.paymentRequired;

        // Execute payment
        const paymentTx = await this.transfer(
          payment.recipient,
          ethers.utils.formatUnits(payment.amount, 18)
        );

        // Retry with payment proof
        const retryResponse = await axios.post(`${CLANKNET_API}/agent/x402`, {
          agentId: this.agentId || 'anonymous',
          wallet: this.wallet.address,
          service: service,
          metadata: {
            ...metadata,
            paymentTx: paymentTx.hash
          }
        });

        return {
          success: true,
          service: service,
          payment: paymentTx,
          receipt: retryResponse.data.receipt
        };
      }

      throw error;
    }
  }

  /**
   * Trade CLANKNET on Uniswap V4
   */
  async trade(action, amount, slippage = 0.5) {
    if (!this.wallet) {
      throw new Error('Wallet required for trading');
    }

    // This is a placeholder for Uniswap V4 integration
    // Full implementation would require the Uniswap V4 SDK

    return {
      action: action,
      amount: amount,
      token: 'CLANKNET',
      router: UNISWAP_V4_ROUTER,
      message: 'Trade execution requires Uniswap V4 SDK integration'
    };
  }

  /**
   * Buy CLANKNET tokens - convenience wrapper for trade
   */
  async buyClanknet(amountInETH) {
    return this.trade('buy', amountInETH, 0.5);
  }

  /**
   * Sell CLANKNET tokens - convenience wrapper for trade
   */
  async sellClanknet(amountInCLANKNET) {
    return this.trade('sell', amountInCLANKNET, 0.5);
  }

  /**
   * Register agent for CLANKNET rewards
   */
  async registerForRewards() {
    if (!this.wallet) {
      throw new Error('Wallet required for registration');
    }

    try {
      const response = await axios.post(`${CLANKNET_API}/agent/register`, {
        agentId: this.agentId,
        wallet: this.wallet.address,
        capabilities: ['trading', 'analysis', 'content']
      });

      return response.data;
    } catch (error) {
      console.error('Registration failed:', error.message);
      return {
        success: false,
        message: 'Registration temporarily unavailable'
      };
    }
  }

  /**
   * Get available agent tasks for earning CLANKNET
   */
  async getAvailableTasks() {
    try {
      const response = await axios.get(`${CLANKNET_API}/agent/tasks`);
      return response.data.tasks || [];
    } catch (error) {
      console.error('Failed to fetch tasks:', error.message);
      return [];
    }
  }

  /**
   * Submit completed task for CLANKNET rewards
   */
  async submitTask(taskId, proof) {
    if (!this.wallet) {
      throw new Error('Wallet required for task submission');
    }

    try {
      const response = await axios.post(`${CLANKNET_API}/agent/tasks/submit`, {
        agentId: this.agentId,
        wallet: this.wallet.address,
        taskId: taskId,
        proof: proof
      });

      return response.data;
    } catch (error) {
      console.error('Task submission failed:', error.message);
      return {
        success: false,
        message: 'Task submission failed'
      };
    }
  }
}

// Export for use in other modules
export default ClanknetSkill;
export { ClanknetSkill, CLANKNET_ADDRESS, BASE_CHAIN_ID };