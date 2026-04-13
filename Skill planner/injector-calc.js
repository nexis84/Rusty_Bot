// Skill Injector Calculator Module
// Calculates injector requirements and optimization

class InjectorCalculator {
    constructor() {
        // SP per injector based on total character SP
        this.injectorTiers = [
            { maxSp: 5000000, spPerInjector: 500000, label: '500,000 SP' },      // 0-5M
            { maxSp: 50000000, spPerInjector: 400000, label: '400,000 SP' },     // 5-50M
            { maxSp: 80000000, spPerInjector: 300000, label: '300,000 SP' },     // 50-80M
            { maxSp: Infinity, spPerInjector: 150000, label: '150,000 SP' }    // 80M+
        ];
        
        this.defaultInjectorPrice = 900000000; // 900M ISK
    }

    // Get SP per injector for a given total SP
    getSPPerInjector(totalSp) {
        const tier = this.injectorTiers.find(t => totalSp < t.maxSp);
        return tier ? tier.spPerInjector : 150000;
    }

    // Get tier label
    getTierLabel(totalSp) {
        const tier = this.injectorTiers.find(t => totalSp < t.maxSp);
        return tier ? tier.label : '150,000 SP';
    }

    // Calculate injectors needed
    calculateInjectors(currentSp, targetSp) {
        let remainingSp = targetSp - currentSp;
        if (remainingSp <= 0) return { count: 0, totalSp: 0, wastedSp: 0 };
        
        let totalInjectors = 0;
        let totalSpInjected = 0;
        let tempSp = currentSp;
        
        while (remainingSp > 0) {
            const spPerInjector = this.getSPPerInjector(tempSp);
            const toInject = Math.min(remainingSp, spPerInjector);
            
            totalInjectors++;
            totalSpInjected += spPerInjector;
            tempSp += spPerInjector;
            remainingSp -= toInject;
        }
        
        const wastedSp = totalSpInjected - (targetSp - currentSp);
        
        return {
            count: totalInjectors,
            totalSp: totalSpInjected,
            actualSp: targetSp - currentSp,
            wastedSp: wastedSp,
            spPerInjector: this.getSPPerInjector(currentSp),
            tierLabel: this.getTierLabel(currentSp)
        };
    }

    // Calculate injector cost
    calculateCost(injectorCount, pricePerInjector = null) {
        const price = pricePerInjector || this.defaultInjectorPrice;
        return {
            perInjector: price,
            total: injectorCount * price,
            formatted: this.formatISK(injectorCount * price)
        };
    }

    // Format ISK
    formatISK(isk) {
        if (isk >= 1000000000000) {
            return (isk / 1000000000000).toFixed(2) + ' T';
        } else if (isk >= 1000000000) {
            return (isk / 1000000000).toFixed(2) + ' B';
        } else if (isk >= 1000000) {
            return (isk / 1000000).toFixed(2) + ' M';
        } else if (isk >= 1000) {
            return (isk / 1000).toFixed(1) + ' K';
        }
        return isk.toLocaleString();
    }

    // Calculate efficiency of injectors vs training
    calculateEfficiency(spNeeded, trainingMinutes, injectorPrice = null) {
        const price = injectorPrice || this.defaultInjectorPrice;
        
        // Calculate injectors needed (assuming worst case tier for simplicity)
        const injectors = Math.ceil(spNeeded / 150000);
        const injectorCost = injectors * price;
        
        // Training is free but takes time
        // Calculate ISK/day equivalent for comparison
        const days = trainingMinutes / 1440;
        
        return {
            injectorsNeeded: injectors,
            injectorCost: injectorCost,
            trainingDays: days.toFixed(1),
            iskPerDaySaved: (injectorCost / days).toFixed(0)
        };
    }

    // Optimize: determine if injectors or training is better
    optimizeForPlan(plan, currentSp, currentSkills = null, injectorPrice = null) {
        const price = injectorPrice || this.defaultInjectorPrice;
        
        // Calculate total SP needed
        let totalSpNeeded = 0;
        const skillDetails = [];
        
        plan.forEach(item => {
            const skillId = item.skillId;
            const targetLevel = item.targetLevel;
            
            // Get current level
            let currentLevel = 0;
            if (currentSkills && currentSkills.skills) {
                const charSkill = currentSkills.skills.find(s => s.skill_id === skillId);
                currentLevel = charSkill ? charSkill.trained_skill_level : 0;
            }
            
            if (targetLevel > currentLevel) {
                const sp = trainingCalc.spNeeded(skillId, currentLevel, targetLevel);
                totalSpNeeded += sp;
                
                skillDetails.push({
                    skillId: skillId,
                    skillName: window.SKILLS[skillId]?.name || 'Unknown',
                    fromLevel: currentLevel,
                    toLevel: targetLevel,
                    spNeeded: sp
                });
            }
        });
        
        if (totalSpNeeded === 0) {
            return {
                message: 'No skills need training',
                recommendation: 'none',
                spNeeded: 0
            };
        }
        
        // Calculate injectors needed
        const injectorCalc = this.calculateInjectors(currentSp, currentSp + totalSpNeeded);
        const cost = this.calculateCost(injectorCalc.count, price);
        
        // Calculate training time
        const trainingResult = trainingCalc.calculatePlanTime(plan, currentSkills);
        
        // Recommendation
        let recommendation = 'balanced';
        if (injectorCalc.count <= 2) {
            recommendation = 'inject';
        } else if (trainingResult.totalMinutes < 1440 * 7) { // Less than a week
            recommendation = 'train';
        }
        
        return {
            spNeeded: totalSpNeeded,
            injectors: injectorCalc,
            cost: cost,
            training: trainingResult,
            recommendation: recommendation,
            details: skillDetails,
            currentTier: this.getTierLabel(currentSp),
            currentEfficiency: this.getSPPerInjector(currentSp)
        };
    }

    // Calculate partial injector efficiency (extractor)
    calculateExtractor(targetSp) {
        // Small injectors: 500k SP extracted = 400k SP injected
        // Always 80% efficiency
        return {
            extractSp: 500000,
            injectSp: 400000,
            efficiency: 0.8,
            wasted: 100000
        };
    }

    // Generate a summary for display
    generateSummary(currentSp, targetSp, injectorPrice = null) {
        const price = injectorPrice || this.defaultInjectorPrice;
        const calc = this.calculateInjectors(currentSp, targetSp);
        const cost = this.calculateCost(calc.count, price);
        
        return {
            summary: `Inject ${calc.totalSp.toLocaleString()} SP using ${calc.count} large skill injector${calc.count !== 1 ? 's' : ''}`,
            cost: cost.formatted + ' ISK',
            wasted: calc.wastedSp.toLocaleString() + ' SP will be wasted',
            efficiency: ((calc.actualSp / calc.totalSp) * 100).toFixed(1) + '%',
            breakdown: this.generateTierBreakdown(currentSp, targetSp)
        };
    }

    // Generate tier-by-tier breakdown
    generateTierBreakdown(startSp, endSp) {
        const tiers = [];
        let currentSp = startSp;
        
        while (currentSp < endSp) {
            const tier = this.injectorTiers.find(t => currentSp < t.maxSp);
            if (!tier) break;
            
            const spInTier = Math.min(endSp, tier.maxSp) - currentSp;
            const injectorsInTier = Math.ceil(spInTier / tier.spPerInjector);
            
            tiers.push({
                range: this.formatSpRange(currentSp, tier.maxSp),
                spPerInjector: tier.spPerInjector,
                injectorsNeeded: injectorsInTier,
                spGained: Math.min(spInTier, injectorsInTier * tier.spPerInjector)
            });
            
            currentSp = tier.maxSp;
        }
        
        return tiers;
    }

    formatSpRange(min, max) {
        if (max === Infinity) return `${this.formatSP(min)}+`;
        return `${this.formatSP(min)} - ${this.formatSP(max)}`;
    }

    formatSP(sp) {
        if (sp >= 1000000) return (sp / 1000000).toFixed(0) + 'M';
        if (sp >= 1000) return (sp / 1000).toFixed(0) + 'K';
        return sp.toString();
    }

    // Get current efficiency description
    getEfficiencyDescription(totalSp) {
        const tier = this.injectorTiers.find(t => totalSp < t.maxSp);
        if (!tier) return 'Very Low (150k per injector)';
        
        if (totalSp < 5000000) return 'Optimal (500k per injector)';
        if (totalSp < 50000000) return 'Good (400k per injector)';
        if (totalSp < 80000000) return 'Reduced (300k per injector)';
        return 'Very Low (150k per injector)';
    }
}

// Create global instance
const injectorCalc = new InjectorCalculator();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InjectorCalculator, injectorCalc };
}
