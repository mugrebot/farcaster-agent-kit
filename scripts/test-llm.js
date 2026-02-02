#!/usr/bin/env node

require('dotenv').config();
const LLMProvider = require('../core/llm-provider');

/**
 * Test LLM Provider Configuration
 * Helps users validate their LLM setup
 */

async function testLLMProvider() {
    console.log('🧪 Testing LLM Configuration');
    console.log('============================');

    const provider = process.env.LLM_PROVIDER || 'pattern';
    console.log(`Current provider: ${provider}\n`);

    if (provider === 'pattern') {
        console.log('✅ Pattern mode selected - no LLM testing needed');
        console.log('   Your agent will use pure voice pattern analysis');
        console.log('   This mode has no API costs and works offline\n');
        return;
    }

    try {
        // Test LLM provider
        const llm = new LLMProvider({
            provider: provider,
            apiKey: getLLMApiKey(provider),
            model: getLLMModel(provider),
            baseURL: process.env.LOCAL_BASE_URL,
            maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 150,
            temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.8
        });

        console.log('⏳ Testing connection...');

        const testResult = await llm.testConnection();

        if (testResult.success) {
            console.log('✅ LLM connection successful!');
            console.log(`   Provider: ${provider}`);
            console.log(`   Model: ${llm.model}`);
            console.log(`   Test response: "${testResult.response}"`);

            // Show provider info
            const info = llm.getProviderInfo();
            console.log('\n📊 Configuration:');
            console.log(`   Max tokens: ${info.maxTokens}`);
            console.log(`   Temperature: ${info.temperature}`);

        } else {
            console.log('❌ LLM connection failed!');
            console.log(`   Error: ${testResult.message}`);
            console.log('\n💡 Troubleshooting:');
            printTroubleshooting(provider);
        }

    } catch (error) {
        console.log('❌ LLM setup error!');
        console.log(`   Error: ${error.message}`);
        console.log('\n💡 Troubleshooting:');
        printTroubleshooting(provider);
    }
}

function getLLMApiKey(provider) {
    switch(provider) {
        case 'openai': return process.env.OPENAI_API_KEY;
        case 'anthropic': return process.env.ANTHROPIC_API_KEY;
        case 'groq': return process.env.GROQ_API_KEY;
        default: return null;
    }
}

function getLLMModel(provider) {
    switch(provider) {
        case 'openai': return process.env.OPENAI_MODEL || 'gpt-4o-mini';
        case 'anthropic': return process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
        case 'groq': return process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
        case 'local': return process.env.LOCAL_MODEL || 'llama3.2:3b';
        default: return null;
    }
}

function printTroubleshooting(provider) {
    const troubleshooting = {
        openai: [
            '1. Get API key from: https://platform.openai.com/api-keys',
            '2. Add to .env: OPENAI_API_KEY=sk-...',
            '3. Ensure you have credits in your OpenAI account'
        ],
        anthropic: [
            '1. Get API key from: https://console.anthropic.com/',
            '2. Add to .env: ANTHROPIC_API_KEY=sk-ant-...',
            '3. Ensure you have credits in your Anthropic account'
        ],
        groq: [
            '1. Get free API key from: https://console.groq.com/keys',
            '2. Add to .env: GROQ_API_KEY=gsk_...',
            '3. Groq offers free tier with high rate limits'
        ],
        local: [
            '1. Install Ollama: https://ollama.ai/',
            '2. Run: ollama pull llama3.2:3b',
            '3. Start Ollama server: ollama serve',
            '4. Ensure LOCAL_BASE_URL points to Ollama (default: http://localhost:11434)'
        ]
    };

    const steps = troubleshooting[provider] || ['Check your provider configuration'];
    steps.forEach(step => console.log(`   ${step}`));
}

// Run test
testLLMProvider().catch(console.error);