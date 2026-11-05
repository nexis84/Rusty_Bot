#!/usr/bin/env node
// Lightweight regression tests for the Skill Planner.
// Run with: npm run test:skillplanner

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FitUtils = require('../fit-utils.js');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

// The browser scripts expect a window object. Make the Node global act as one
// so SKILLS/SP_TABLE land somewhere the calculator can read them.
global.window = globalThis;
vm.runInThisContext(read('skills-data.js') + '\n;globalThis.__SKILLS_FILE__ = true;', {
    filename: 'skills-data.js'
});
vm.runInThisContext(
    read('training-calc.js') + '\n;globalThis.__TrainingCalculator = TrainingCalculator;',
    { filename: 'training-calc.js' }
);

const TrainingCalculator = globalThis.__TrainingCalculator;
const fitData = JSON.parse(read('fit-data.json'));

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}
function approx(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 0.000001, `${message || 'values differ'}: ${actual} != ${expected}`);
}

test('SP table matches EVE cumulative skill points', () => {
    assert.deepEqual({ ...window.SP_TABLE }, { 1: 250, 2: 1415, 3: 8000, 4: 45255, 5: 256000 });
});

test('spNeeded multiplies the SP table by skill rank', () => {
    const calc = new TrainingCalculator();
    const skillId = 3328; // Gallente Frigate
    const rank = window.SKILLS[skillId].rank;
    assert.equal(calc.spNeeded(skillId, 0, 1), 250 * rank);
    assert.equal(calc.spNeeded(skillId, 3, 5), (256000 - 8000) * rank);
    assert.equal(calc.spNeeded(skillId, 5, 5), 0);
});

test('Omega training uses primary + secondary/2', () => {
    const calc = new TrainingCalculator();
    calc.setCloneState('omega');
    calc.setAttributes({ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 });
    const minutes = calc.calculateTime(3000, 'intelligence', 'memory');
    approx(minutes, 3000 / 30);
});

test('Alpha training takes exactly twice as long as Omega', () => {
    const calc = new TrainingCalculator();
    calc.setAttributes({ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 });
    calc.setCloneState('omega');
    const omega = calc.calculateTime(3000, 'intelligence', 'memory');
    calc.setCloneState('alpha');
    const alpha = calc.calculateTime(3000, 'intelligence', 'memory');
    approx(alpha, omega * 2);
    calc.setCloneState('unexpected');
    assert.equal(calc.cloneState, 'omega');
});

test('Implant and cerebral accelerator bonuses reduce training time', () => {
    const calc = new TrainingCalculator();
    calc.setAttributes({ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 });
    calc.setCloneState('omega');
    const base = calc.calculateTime(6000, 'intelligence', 'memory');

    calc.setImplant(6, 5); // +5 Intelligence
    const implanted = calc.calculateTime(6000, 'intelligence', 'memory');
    assert.ok(implanted < base);

    calc.setCerebralAccelerator(true, 10);
    const accelerated = calc.calculateTime(6000, 'intelligence', 'memory');
    assert.ok(accelerated < implanted);
});

test('Plan time only counts levels not already trained', () => {
    const calc = new TrainingCalculator();
    calc.setAttributes({ intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 });
    calc.setCloneState('omega');
    const plan = [{ skillId: 3327, targetLevel: 3 }];
    const skills = { skills: [{ skill_id: 3327, trained_skill_level: 2 }] };
    const summary = calc.calculatePlanTime(plan, skills);
    approx(summary.details[0].sp, calc.spNeeded(3327, 2, 3));
    assert.equal(summary.details.length, 1);

    const fullyTrained = calc.calculatePlanTime([{ skillId: 3327, targetLevel: 2 }], skills);
    assert.equal(fullyTrained.totalMinutes, 0);
    assert.equal(fullyTrained.details.length, 0);
});

test('Fit data has valid ids, names and skill references', () => {
    const keys = Object.keys(fitData);
    assert.ok(keys.length > 9000, `expected >9000 fit entries, got ${keys.length}`);

    // These SDE types are unpublished/QA items whose requiredSkill attributes
    // point at IDs that are not real player skills. The app ignores skills it
    // cannot resolve, but the data itself is still valid.
    const knownNonPlayerSkills = new Set([
        '3448', '3755', '9955', '10264',
        '12180', '12181', '12182', '12183', '12184', '12185', '12186',
        '12187', '12188', '12190', '12191', '12192', '12193', '12194',
        '12195', '19430'
    ]);

    for (const entry of Object.values(fitData)) {
        assert.ok(Number.isInteger(entry.id) && entry.id > 0, `bad type id for ${entry.name}`);
        assert.ok(typeof entry.name === 'string' && entry.name.trim().length > 0);
        for (const [skillId, level] of Object.entries(entry.skills || {})) {
            assert.ok(
                window.SKILLS[skillId] || knownNonPlayerSkills.has(skillId),
                `${entry.name} references unknown skill ${skillId}`
            );
            assert.ok(Number.isInteger(level) && level >= 1 && level <= 5, `${entry.name} has invalid level ${level}`);
        }
    }

    assert.equal(window.SKILLS[3328].name, 'Gallente Frigate');
    assert.equal(fitData['ishtar'].id, 12005);
    assert.equal(fitData['warrior ii'].id, 2488);
});

test('Fit resolver handles punctuation, aliases and unknown names', () => {
    assert.equal(
        FitUtils.normalizeFitName('  ‘Vigilant’   Shield Command Burst  '),
        "'vigilant' shield command burst"
    );

    const microwarp = FitUtils.resolveFitEntry(fitData, '5MN Microwarp Drive II');
    assert.equal(microwarp?.name, '5MN Microwarpdrive II');

    const dampener = FitUtils.resolveFitEntry(fitData, 'Sensor Dampener II');
    assert.equal(dampener?.name, 'Remote Sensor Dampener II');

    const bulkhead = FitUtils.resolveFitEntry(fitData, 'Reinforced Bulkhead II');
    assert.equal(bulkhead?.name, 'Reinforced Bulkheads II');

    const curly = FitUtils.resolveFitEntry(fitData, '‘Vigilant’ Shield Command Burst');
    assert.equal(curly?.name, '‘Vigilant’ Shield Command Burst');

    assert.equal(FitUtils.resolveFitEntry(fitData, 'Definitely Not A Real Module'), null);
});

test('Every skill prerequisite points at a real skill', () => {
    for (const [skillId, skill] of Object.entries(window.SKILLS)) {
        for (const [prereqId, level] of Object.entries(skill.prereqs || {})) {
            assert.ok(window.SKILLS[prereqId], `${skill.name} (${skillId}) references missing prerequisite ${prereqId}`);
            assert.ok(Number.isInteger(level) && level >= 1 && level <= 5);
        }
    }
});

(async () => {
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  PASS  ${name}`);
        } catch (error) {
            failed++;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${error.message}`);
        }
    }

    console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
    process.exitCode = failed === 0 ? 0 : 1;
})();
