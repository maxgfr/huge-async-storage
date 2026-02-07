/**
 * Tests for huge-async-storage
 *
 * These tests verify the core functionality of the storage wrapper.
 */

// Mock AsyncStorage before importing
const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();
const mockRemoveItem = jest.fn<Promise<void>, [string]>();
const mockClear = jest.fn<Promise<void>, []>();
const mockGetAllKeys = jest.fn<Promise<readonly string[]>, []>();
const mockMultiGet = jest.fn();
const mockMultiSet = jest.fn();
const mockMultiRemove = jest.fn();
const mockMergeItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (...args: any[]) => mockGetItem(...args),
    setItem: (...args: any[]) => mockSetItem(...args),
    removeItem: (...args: any[]) => mockRemoveItem(...args),
    clear: (...args: any[]) => mockClear(...args),
    getAllKeys: (...args: any[]) => mockGetAllKeys(...args),
    multiGet: (...args: any[]) => mockMultiGet(...args),
    multiSet: (...args: any[]) => mockMultiSet(...args),
    multiRemove: (...args: any[]) => mockMultiRemove(...args),
    mergeItem: (...args: any[]) => mockMergeItem(...args),
  },
}));

import {storeAsync, getAsync, removeAsync} from './storage';

describe('storeAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should store a simple object', async () => {
      const data = {name: 'John', age: 30};
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('user', data);

      expect(mockSetItem).toHaveBeenCalledTimes(2); // 1 chunk + count
      expect(mockSetItem).toHaveBeenCalledWith('user0', JSON.stringify(data));
      expect(mockSetItem).toHaveBeenCalledWith('user', '1');
    });

    it('should store data larger than chunk size', async () => {
      const largeData = {items: Array(100_000).fill('x')}; // 100k items = large JSON
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('large', largeData);

      // The JSON serialization of 100k items creates a large string that will be split
      // Verify it was stored (exact chunk count depends on JSON size)
      expect(mockSetItem).toHaveBeenCalledWith('large', expect.any(String));
      expect(mockSetItem).toHaveBeenCalled();
    });

    it('should store an empty array', async () => {
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('empty', []);

      expect(mockSetItem).toHaveBeenCalledWith('empty0', '[]');
      expect(mockSetItem).toHaveBeenCalledWith('empty', '1');
    });

    it('should store an empty object', async () => {
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('emptyObj', {});

      expect(mockSetItem).toHaveBeenCalledWith('emptyObj0', '{}');
      expect(mockSetItem).toHaveBeenCalledWith('emptyObj', '1');
    });

    it('should store null values', async () => {
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('nullValue', null);

      expect(mockSetItem).toHaveBeenCalledWith('nullValue0', 'null');
      expect(mockSetItem).toHaveBeenCalledWith('nullValue', '1');
    });

    it('should store special characters in data', async () => {
      const specialData = {text: 'Hello "world"!\n\tTest\'s data'};
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('special', specialData);

      expect(mockSetItem).toHaveBeenCalledTimes(2);
    });

    it('should store unicode characters', async () => {
      const unicodeData = {emoji: '🚀🎉', chinese: '中文', arabic: 'العربية'};
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('unicode', unicodeData);

      expect(mockSetItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should throw error for empty key', async () => {
      await expect(storeAsync('', {data: 'test'})).rejects.toThrow(
        'Storage key cannot be empty',
      );
    });

    it('should throw error for whitespace-only key', async () => {
      await expect(storeAsync('   ', {data: 'test'})).rejects.toThrow(
        'Storage key cannot be empty',
      );
    });

    it('should clean up chunks on storage failure', async () => {
      mockSetItem
        .mockResolvedValueOnce(undefined) // chunk 0
        .mockRejectedValueOnce(new Error('Storage full')); // chunk 1 fails

      await expect(storeAsync('fail', {data: 'test'})).rejects.toThrow(
        'Storage full',
      );

      // Should attempt to clean up the first chunk
      expect(mockRemoveItem).toHaveBeenCalledWith('fail0');
    });

    it('should handle serialization errors', async () => {
      // Circular reference cannot be serialized
      const circular: any = {name: 'test'};
      circular.self = circular;

      await expect(storeAsync('circular', circular)).rejects.toThrow();
    });

    it('should propagate storage errors', async () => {
      mockSetItem.mockRejectedValue(new Error('Disk full'));

      await expect(storeAsync('error', {data: 'test'})).rejects.toThrow(
        'Disk full',
      );
    });
  });

  describe('edge cases', () => {
    it('should store exactly at chunk boundary', async () => {
      const exactChunkData = 'x'.repeat(1_000_000);
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('exact', exactChunkData);

      // When stored as JSON string: "xxxx..." (with quotes) = 1,000,002 chars
      // So it should create 2 chunks + count
      expect(mockSetItem).toHaveBeenCalledWith('exact', '2');
    });

    it('should store just over chunk boundary', async () => {
      const overChunkData = 'x'.repeat(1_000_001);
      mockSetItem.mockResolvedValue(undefined);

      await storeAsync('over', overChunkData);

      expect(mockSetItem).toHaveBeenCalledTimes(3); // 2 chunks + count
    });
  });
});

describe('getAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should retrieve a simple stored object', async () => {
      const data = {name: 'John', age: 30};
      mockGetItem.mockImplementation(key => {
        if (key === 'user') {
          return Promise.resolve('1');
        }
        if (key === 'user0') {
          return Promise.resolve(JSON.stringify(data));
        }
        return Promise.resolve(null);
      });

      const result = await getAsync('user');

      expect(result).toEqual(data);
    });

    it('should retrieve large data across multiple chunks', async () => {
      // Create data that will span multiple chunks when JSON serialized
      const largeData = {data: 'x'.repeat(1_000_000)};
      const serialized = JSON.stringify(largeData);
      const splitPoint = 1_000_000;
      const chunk1 = serialized.slice(0, splitPoint);
      const chunk2 = serialized.slice(splitPoint);

      mockGetItem.mockImplementation(key => {
        if (key === 'large') {
          return Promise.resolve('2');
        }
        if (key === 'large0') {
          return Promise.resolve(chunk1);
        }
        if (key === 'large1') {
          return Promise.resolve(chunk2);
        }
        return Promise.resolve(null);
      });

      const result = await getAsync<typeof largeData>('large');

      expect(result).toEqual(largeData);
    });

    it('should retrieve an empty array', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'empty') {
          return Promise.resolve('1');
        }
        if (key === 'empty0') {
          return Promise.resolve('[]');
        }
        return Promise.resolve(null);
      });

      const result = await getAsync('empty');

      expect(result).toEqual([]);
    });

    it('should retrieve an empty object', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'emptyObj') {
          return Promise.resolve('1');
        }
        if (key === 'emptyObj0') {
          return Promise.resolve('{}');
        }
        return Promise.resolve(null);
      });

      const result = await getAsync('emptyObj');

      expect(result).toEqual({});
    });

    it('should retrieve null value', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'nullValue') {
          return Promise.resolve('1');
        }
        if (key === 'nullValue0') {
          return Promise.resolve('null');
        }
        return Promise.resolve(null);
      });

      const result = await getAsync('nullValue');

      expect(result).toBeNull();
    });

    it('should parse complex nested objects', async () => {
      const complexData = {
        user: {name: 'John', address: {city: 'Paris', zip: '75001'}},
        tags: ['a', 'b', 'c'],
        meta: {count: 42, active: true},
      };

      mockGetItem.mockImplementation(key => {
        if (key === 'complex') {
          return Promise.resolve('1');
        }
        if (key === 'complex0') {
          return Promise.resolve(JSON.stringify(complexData));
        }
        return Promise.resolve(null);
      });

      const result = await getAsync('complex');

      expect(result).toEqual(complexData);
    });
  });

  describe('error handling', () => {
    it('should throw error for empty key', async () => {
      await expect(getAsync('')).rejects.toThrow('Storage key cannot be empty');
    });

    it('should throw error for whitespace-only key', async () => {
      await expect(getAsync('   ')).rejects.toThrow(
        'Storage key cannot be empty',
      );
    });

    it('should throw error when key does not exist', async () => {
      mockGetItem.mockResolvedValue(null);

      await expect(getAsync('nonexistent')).rejects.toThrow(
        'No data found for key "nonexistent"',
      );
    });

    it('should throw error when a chunk is missing', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'missing') {
          return Promise.resolve('2');
        }
        if (key === 'missing0') {
          return Promise.resolve('chunk1');
        }
        if (key === 'missing1') {
          return Promise.resolve(null);
        } // Missing chunk!
        return Promise.resolve(null);
      });

      await expect(getAsync('missing')).rejects.toThrow(
        'Storage corruption: chunk 1 of 2 missing for key "missing"',
      );
    });

    it('should throw error for invalid chunk count', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'invalid') {
          return Promise.resolve('not-a-number');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('invalid')).rejects.toThrow(
        'Invalid chunk count for key "invalid"',
      );
    });

    it('should throw error for negative chunk count', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'negative') {
          return Promise.resolve('-1');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('negative')).rejects.toThrow(
        'Invalid chunk count for key "negative"',
      );
    });

    it('should throw error for zero chunks', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'zero') {
          return Promise.resolve('0');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('zero')).rejects.toThrow(
        'No data found for key "zero"',
      );
    });

    it('should throw error for malformed JSON', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'malformed') {
          return Promise.resolve('1');
        }
        if (key === 'malformed0') {
          return Promise.resolve('{invalid json}');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('malformed')).rejects.toThrow(
        'Failed to parse data for key "malformed"',
      );
    });

    it('should throw error when result is empty after concatenation', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'empty') {
          return Promise.resolve('1');
        }
        if (key === 'empty0') {
          return Promise.resolve('');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('empty')).rejects.toThrow(
        'No data found for key "empty"',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle NaN chunk count', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'nan') {
          return Promise.resolve('NaN');
        }
        return Promise.resolve(null);
      });

      await expect(getAsync('nan')).rejects.toThrow(
        'Invalid chunk count for key "nan"',
      );
    });

    it('should handle very large chunk count', async () => {
      mockGetItem.mockImplementation(key => {
        if (key === 'largeCount') {
          return Promise.resolve('999999');
        }
        return Promise.resolve(null);
      });

      // Should fail because chunks don't actually exist
      await expect(getAsync('largeCount')).rejects.toThrow(
        'Storage corruption',
      );
    });
  });
});

describe('removeAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should remove a single chunk entry', async () => {
      mockGetItem.mockResolvedValue('1');
      mockRemoveItem.mockResolvedValue(undefined);

      await removeAsync('user');

      expect(mockRemoveItem).toHaveBeenCalledWith('user0');
      expect(mockRemoveItem).toHaveBeenCalledWith('user');
      expect(mockRemoveItem).toHaveBeenCalledTimes(2);
    });

    it('should remove multiple chunks', async () => {
      mockGetItem.mockResolvedValue('3');
      mockRemoveItem.mockResolvedValue(undefined);

      await removeAsync('large');

      expect(mockRemoveItem).toHaveBeenCalledWith('large0');
      expect(mockRemoveItem).toHaveBeenCalledWith('large1');
      expect(mockRemoveItem).toHaveBeenCalledWith('large2');
      expect(mockRemoveItem).toHaveBeenCalledWith('large');
      expect(mockRemoveItem).toHaveBeenCalledTimes(4);
    });

    it('should succeed silently when key does not exist', async () => {
      mockGetItem.mockResolvedValue(null);

      await expect(removeAsync('nonexistent')).resolves.toBeUndefined();

      expect(mockRemoveItem).not.toHaveBeenCalled();
    });

    it('should be idempotent - removing twice should succeed', async () => {
      mockGetItem.mockResolvedValueOnce('1').mockResolvedValueOnce(null);
      mockRemoveItem.mockResolvedValue(undefined);

      await removeAsync('user');
      await removeAsync('user');

      expect(mockRemoveItem).toHaveBeenCalledTimes(2); // Only from first call
    });
  });

  describe('error handling', () => {
    it('should throw error for empty key', async () => {
      await expect(removeAsync('')).rejects.toThrow(
        'Storage key cannot be empty',
      );
    });

    it('should throw error for whitespace-only key', async () => {
      await expect(removeAsync('   ')).rejects.toThrow(
        'Storage key cannot be empty',
      );
    });

    it('should throw error for invalid chunk count', async () => {
      mockGetItem.mockResolvedValue('invalid');

      await expect(removeAsync('invalid')).rejects.toThrow(
        'Invalid chunk count for key "invalid"',
      );
    });

    it('should throw error for negative chunk count', async () => {
      mockGetItem.mockResolvedValue('-5');

      await expect(removeAsync('negative')).rejects.toThrow(
        'Invalid chunk count for key "negative"',
      );
    });

    it('should propagate storage errors during chunk removal', async () => {
      mockGetItem.mockResolvedValue('2');
      mockRemoveItem.mockRejectedValue(new Error('Disk error'));

      await expect(removeAsync('fail')).rejects.toThrow('Disk error');
    });
  });

  describe('edge cases', () => {
    it('should handle zero chunks gracefully', async () => {
      mockGetItem.mockResolvedValue('0');
      mockRemoveItem.mockResolvedValue(undefined);

      await removeAsync('zero');

      expect(mockRemoveItem).toHaveBeenCalledWith('zero');
      expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    });

    it('should handle NaN chunk count', async () => {
      mockGetItem.mockResolvedValue('NaN');

      await expect(removeAsync('nan')).rejects.toThrow(
        'Invalid chunk count for key "nan"',
      );
    });
  });
});

describe('integration scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle complete store-get-remove cycle', async () => {
    const data = {items: ['a', 'b', 'c']};

    // Store
    mockSetItem.mockResolvedValue(undefined);
    await storeAsync('cycle', data);
    expect(mockSetItem).toHaveBeenCalledTimes(2);

    // Get
    mockGetItem.mockImplementation(key => {
      if (key === 'cycle') {
        return Promise.resolve('1');
      }
      if (key === 'cycle0') {
        return Promise.resolve(JSON.stringify(data));
      }
      return Promise.resolve(null);
    });
    const retrieved = await getAsync('cycle');
    expect(retrieved).toEqual(data);

    // Remove
    mockGetItem.mockResolvedValue('1');
    mockRemoveItem.mockResolvedValue(undefined);
    await removeAsync('cycle');
    expect(mockRemoveItem).toHaveBeenCalledWith('cycle0');
    expect(mockRemoveItem).toHaveBeenCalledWith('cycle');
  });

  it('should handle multiple keys independently', async () => {
    mockSetItem.mockResolvedValue(undefined);

    await Promise.all([
      storeAsync('key1', {value: 1}),
      storeAsync('key2', {value: 2}),
      storeAsync('key3', {value: 3}),
    ]);

    expect(mockSetItem).toHaveBeenCalledTimes(6); // 3 keys * 2 operations each
  });

  it('should handle overwriting existing data', async () => {
    mockSetItem.mockResolvedValue(undefined);

    // First write
    await storeAsync('overwrite', {version: 1});

    // Second write (should overwrite)
    await storeAsync('overwrite', {version: 2});

    expect(mockSetItem).toHaveBeenCalledWith(
      'overwrite0',
      expect.stringContaining('version'),
    );
    expect(mockSetItem).toHaveBeenCalledTimes(4); // 2 per write
  });
});

describe('type safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should preserve type information for objects', async () => {
    interface User {
      name: string;
      age: number;
      active: boolean;
    }

    const user: User = {name: 'Alice', age: 30, active: true};

    mockSetItem.mockResolvedValue(undefined);
    mockGetItem.mockImplementation(key => {
      if (key === 'user') {
        return Promise.resolve('1');
      }
      if (key === 'user0') {
        return Promise.resolve(JSON.stringify(user));
      }
      return Promise.resolve(null);
    });

    await storeAsync<User>('user', user);
    const retrieved = await getAsync<User>('user');

    // Type should be preserved
    expect(retrieved.name).toBe('Alice');
    expect(retrieved.age).toBe(30);
    expect(retrieved.active).toBe(true);
  });

  it('should work with arrays', async () => {
    const numbers = [1, 2, 3, 4, 5];

    mockSetItem.mockResolvedValue(undefined);
    mockGetItem.mockImplementation(key => {
      if (key === 'numbers') {
        return Promise.resolve('1');
      }
      if (key === 'numbers0') {
        return Promise.resolve(JSON.stringify(numbers));
      }
      return Promise.resolve(null);
    });

    await storeAsync('numbers', numbers);
    const retrieved = await getAsync<number[]>('numbers');

    expect(retrieved).toEqual([1, 2, 3, 4, 5]);
    expect(retrieved[0] * 2).toBe(2); // Type inference works
  });
});
