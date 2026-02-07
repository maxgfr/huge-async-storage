import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage has size limits varying by platform.
 * iOS default: ~6MB total, Android: ~6MB default.
 * Using 1MB per chunk provides a safety margin.
 */
const CHUNK_SIZE = 1_000_000;

/**
 * Validates that a key is not empty or whitespace-only.
 * @throws {Error} If key is invalid.
 */
function validateKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new Error('Storage key cannot be empty or whitespace-only');
  }
}

/**
 * Stores large data by splitting it into chunks.
 * @param key - The storage key to use.
 * @param data - The data to store (will be JSON serialized).
 * @throws {Error} If key is invalid, data cannot be serialized, or storage fails.
 *
 * @example
 * await storeAsync('user', { name: 'John', items: Array(1000000).fill('data') });
 */
export async function storeAsync<T>(key: string, data: T): Promise<void> {
  validateKey(key);

  const serialized = JSON.stringify(data);
  const chunks = serialized.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')) || [];

  if (chunks.length === 0) {
    throw new Error(`Cannot store empty data for key "${key}"`);
  }

  // Track written chunks for cleanup on failure
  let writtenChunks = 0;

  try {
    // Store chunks sequentially to ensure order and prevent race conditions
    for (let i = 0; i < chunks.length; i++) {
      await AsyncStorage.setItem(`${key}${i}`, chunks[i]);
      writtenChunks++;
    }
    // Store the chunk count as the last operation
    await AsyncStorage.setItem(key, String(chunks.length));
  } catch (error) {
    // Cleanup partially written chunks on failure
    for (let i = 0; i < writtenChunks; i++) {
      try {
        await AsyncStorage.removeItem(`${key}${i}`);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Retrieves data that was stored using {@link storeAsync}.
 * @param key - The storage key to retrieve.
 * @returns The parsed data of type T.
 * @throws {Error} If key is invalid, data not found, chunks are missing, or JSON parsing fails.
 *
 * @example
 * const user = await getAsync<{ name: string }>('user');
 */
export async function getAsync<T>(key: string): Promise<T> {
  validateKey(key);

  const numberOfParts = await AsyncStorage.getItem(key);

  if (numberOfParts === null) {
    throw new Error(`No data found for key "${key}"`);
  }

  const count = parseInt(numberOfParts, 10);

  if (isNaN(count) || count < 0) {
    throw new Error(`Invalid chunk count for key "${key}": ${numberOfParts}`);
  }

  if (count === 0) {
    throw new Error(`No data found for key "${key}" (zero chunks)`);
  }

  // Collect chunks into an array for better performance
  const chunks: string[] = [];

  for (let i = 0; i < count; i++) {
    const part = await AsyncStorage.getItem(`${key}${i}`);
    if (part === null) {
      throw new Error(
        `Storage corruption: chunk ${i} of ${count} missing for key "${key}"`
      );
    }
    chunks.push(part);
  }

  const serialized = chunks.join('');

  if (serialized.length === 0) {
    throw new Error(`No data found for key "${key}" (empty data)`);
  }

  try {
    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse data for key "${key}": ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Removes data that was stored using {@link storeAsync}.
 * If the key doesn't exist, the function succeeds (idempotent operation).
 * @param key - The storage key to remove.
 * @throws {Error} If key is invalid or removal fails.
 *
 * @example
 * await removeAsync('user');
 */
export async function removeAsync(key: string): Promise<void> {
  validateKey(key);

  const numberOfParts = await AsyncStorage.getItem(key);

  // If key doesn't exist, we're already done (idempotent)
  if (numberOfParts !== null) {
    const count = parseInt(numberOfParts, 10);

    if (isNaN(count) || count < 0) {
      throw new Error(`Invalid chunk count for key "${key}": ${numberOfParts}`);
    }

    // Remove all chunks
    for (let i = 0; i < count; i++) {
      await AsyncStorage.removeItem(`${key}${i}`);
    }
    // Remove the metadata key
    await AsyncStorage.removeItem(key);
  }
  // If key doesn't exist, silently succeed (desired end state achieved)
}
