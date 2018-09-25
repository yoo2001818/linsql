module.exports = {
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.json',
    },
  },
  moduleFileExtensions: [
    'ts',
    'js',
  ],
  testMatch: [
    '**/test/**/*.test.(ts|js)',
  ],
  testEnvironment: 'node',
  preset: 'ts-jest',
};
