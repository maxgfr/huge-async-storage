// Mock React Native for tests
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {},
}));
