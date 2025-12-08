const simpleAttributes = [
    { word: 'Happy', sentiment: 'good' },
    { word: 'Sad', sentiment: 'bad' },
    { word: 'Brave', sentiment: 'good' },
    { word: 'Mean', sentiment: 'bad' },
    { word: 'Kind', sentiment: 'good' },
    { word: 'Honest', sentiment: 'good' },
    { word: 'Cheerful', sentiment: 'good' },
    { word: 'Cruel', sentiment: 'bad' },
    { word: 'Dishonest', sentiment: 'bad' },
    { word: 'Angry', sentiment: 'bad' }
];

const categoryPairs = [
    { word: 'Female Doctor', expectedTilt: 'left' },
    { word: 'Male Nurse', expectedTilt: 'right' },
    { word: 'Gay Teacher', expectedTilt: 'left' },
    { word: 'Old Coder', expectedTilt: 'right' },
    { word: 'Female Engineer', expectedTilt: 'left' },
    { word: 'Disabled Genius', expectedTilt: 'left' },
    { word: 'Black CEO', expectedTilt: 'left' },
    { word: 'Homeless Veteran', expectedTilt: 'right' }
];

function pickStimulusForStage(stage) {
    if (stage.key === 'tutorial') {
        return buildStimulus(sample(simpleAttributes));
    }

    const roll = random();
    if (stage.key === 'level1') {
        return roll < 0.6 ? buildStimulus(sample(simpleAttributes)) : buildStimulus(sample(categoryPairs));
    }
    if (stage.key === 'level2') {
        return roll < 0.2 ? buildStimulus(sample(simpleAttributes)) : buildStimulus(sample(categoryPairs));
    }
    // level3
    return buildStimulus(sample(categoryPairs));
}

function buildStimulus(base) {
    const expectedTilt = decideExpectedTilt(base);
    return {
        word: base.word,
        category: base.word,
        expectedTilt
    };
}

function decideExpectedTilt(base) {
    // Use predefined tilt if available (for consistent category mapping)
    if (base.expectedTilt) return base.expectedTilt;
    // Sentiment-based for simple attributes
    if (base.sentiment === 'good') return 'left';
    if (base.sentiment === 'bad') return 'right';
    // Fallback (shouldn't reach here with current data)
    return random() < 0.5 ? 'left' : 'right';
}

function sample(arr) {
    return arr[int(random(arr.length))];
}
