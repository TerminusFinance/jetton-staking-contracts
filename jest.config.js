module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
};