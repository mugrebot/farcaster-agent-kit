/**
 * Test script for dual-model optimization
 * Demonstrates using cheaper model for coordination vs expensive model for content
 */

require('dotenv').config();
const LLMProvider = require('../core/llm-provider');
const CoordinationExamples = require('../core/coordination-examples');

async function testDualModel() {
    console.log('🧪 Testing Dual-Model System');
    console.log('============================\n');

    // Initialize LLM with both models
    const llm = new LLMProvider({
        provider: process.env.LLM_PROVIDER || 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-6',
        subModel: process.env.SUB_MODEL || 'claude-sonnet-4-5',
        maxTokens: 150,
        temperature: 0.8
    });

    console.log(`📊 Configuration:`);
    console.log(`   Main Model (Creative): ${llm.model}`);
    console.log(`   Sub Model (Coordination): ${llm.subModel}`);
    console.log(`   Provider: ${llm.provider}\n`);

    // Test creative content generation (uses expensive model)
    console.log('🎨 Testing Creative Generation (Opus):');
    try {
        const creativePrompt = `Write a short, funny tweet about debugging code at 3am. Be authentic and use lowercase.`;

        console.time('Creative generation time');
        const creative = await llm.generateContent(creativePrompt, {
            username: 'm00npapi',
            mode: 'post'
        });
        console.timeEnd('Creative generation time');

        console.log(`   Result: "${creative.content}"`);
        console.log(`   Provider: ${creative.provider}\n`);
    } catch (error) {
        console.error(`   ❌ Creative generation failed: ${error.message}\n`);
    }

    // Test coordination decision (uses cheaper model)
    console.log('💰 Testing Coordination Decision (Sonnet):');
    try {
        const coordinationPrompt = `Should I post right now? I posted 2 times in the last hour. Answer YES or NO.`;

        console.time('Coordination decision time');
        const coordination = await llm.generateCoordination(coordinationPrompt, {
            username: 'm00npapi',
            mode: 'decision'
        });
        console.timeEnd('Coordination decision time');

        console.log(`   Result: "${coordination.content}"`);
        console.log(`   Provider: ${coordination.provider}\n`);
    } catch (error) {
        console.error(`   ❌ Coordination decision failed: ${error.message}\n`);
    }

    // Test coordination examples
    console.log('📝 Testing Coordination Examples:');
    const coordinator = new CoordinationExamples(llm);

    // Test reply decision
    try {
        const mention = {
            text: 'hey @m00npapi what do you think about the new AI models?',
            author: { username: 'techfan' }
        };

        console.time('Reply decision time');
        const replyDecision = await coordinator.shouldReplyToMention(mention);
        console.timeEnd('Reply decision time');

        console.log(`   Should reply: ${replyDecision.shouldReply}`);
        console.log(`   Reason: ${replyDecision.reason}\n`);
    } catch (error) {
        console.error(`   ❌ Reply decision failed: ${error.message}\n`);
    }

    // Test news filtering
    try {
        const newsTitle = 'OpenAI Releases New Model with Better Reasoning';
        const newsDesc = 'The latest model shows improvements in logical reasoning and code generation.';

        console.time('News filter time');
        const isRelevant = await coordinator.isNewsRelevant(newsTitle, newsDesc);
        console.timeEnd('News filter time');

        console.log(`   News relevant: ${isRelevant}\n`);
    } catch (error) {
        console.error(`   ❌ News filtering failed: ${error.message}\n`);
    }

    console.log('✅ Dual-model testing complete!');
    console.log('\n💡 Cost Savings Analysis:');
    console.log('   - Sonnet 4.5 is ~80% cheaper than Opus 4.6');
    console.log('   - Coordination tasks represent ~40% of LLM calls');
    console.log('   - Estimated savings: ~32% reduction in API costs');
}

// Run the test
testDualModel().catch(console.error);