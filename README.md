# huge-async-storage

A robust wrapper around [React Native's AsyncStorage](https://react-native-async-storage.github.io/async-storage/) that enables storage of large data exceeding typical size limitations by intelligently chunking the data.

## Features

- **Store unlimited data size**: Automatically splits data into 1MB chunks
- **TypeScript support**: Full type safety with generics
- **Promise-based API**: Modern async/await syntax
- **Error handling**: Comprehensive error messages for debugging
- **Idempotent operations**: Safe to call multiple times
- **Cleanup on failure**: Automatically removes partial data on storage errors
- **Null-safety**: Handles missing or corrupted data gracefully

## Installation

```sh
yarn add huge-async-storage
# or
npm install huge-async-storage
```

## Quick Start

```tsx
import { storeAsync, getAsync, removeAsync } from "huge-async-storage";

// Store large data (automatically chunked)
await storeAsync('users', { list: Array(1000000).fill({ id: 1, name: 'John' }) });

// Retrieve the data
const users = await getAsync('users');

// Remove the data
await removeAsync('users');
```

## API Reference

### `storeAsync<T>(key: string, data: T): Promise<void>`

Stores data by splitting it into manageable chunks and saving them to AsyncStorage.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | `string` | Yes | The storage key. Must be non-empty and not whitespace-only. |
| `data` | `T` | Yes | The data to store. Will be JSON serialized. |

#### Throws

- `Error` - If key is empty or whitespace-only
- `Error` - If data cannot be serialized (e.g., circular references)
- `Error` - If storage operation fails (with automatic cleanup of partial data)

#### Side Effects

- Creates multiple keys in AsyncStorage: `key0`, `key1`, ..., `keyN` for data chunks
- Stores chunk count under the original `key`
- On failure, removes all partially written chunks

#### Examples

```typescript
// Simple object
await storeAsync('user', { name: 'Alice', age: 30 });

// Large array (will be chunked automatically)
const largeData = { items: Array(1000000).fill('data') };
await storeAsync('large', largeData);

// Null values are supported
await storeAsync('settings', null);

// Complex nested objects
await storeAsync('config', {
  database: { host: 'localhost', port: 5432 },
  features: ['auth', 'logging', 'caching']
});
```

---

### `getAsync<T>(key: string): Promise<T>`

Retrieves and reconstructs data that was stored using `storeAsync`.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | `string` | Yes | The storage key to retrieve. |

#### Returns

`Promise<T>` - The reconstructed data with the original type.

#### Throws

- `Error` - If key is empty or whitespace-only
- `Error` - If no data exists for the given key
- `Error` - If chunk count is invalid or corrupted
- `Error` - If any chunk is missing (storage corruption)
- `Error` - If data cannot be parsed as valid JSON

#### Examples

```typescript
// With explicit type
interface User {
  name: string;
  age: number;
  active: boolean;
}

const user = await getAsync<User>('user');
console.log(user.name); // Type-safe access

// Type inference
const settings = await getAsync<{ theme: 'light' | 'dark' }>('settings');

// Array types
const items = await getAsync<number[]>('numbers');
items.map(n => n * 2); // Type-safe operations
```

---

### `removeAsync(key: string): Promise<void>`

Removes all chunks and metadata associated with a key.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | `string` | Yes | The storage key to remove. |

#### Throws

- `Error` - If key is empty or whitespace-only
- `Error` - If chunk count is invalid
- `Error` - If removal operation fails

#### Side Effects

- Removes all chunk keys (`key0`, `key1`, ..., `keyN`)
- Removes the metadata key

#### Behavior

- **Idempotent**: Calling `removeAsync` multiple times on the same key is safe
- **Silent success**: If the key doesn't exist, the operation succeeds without error

#### Examples

```typescript
// Remove stored data
await removeAsync('tempData');

// Safe to call multiple times
await removeAsync('cache');
await removeAsync('cache'); // No error thrown

// Non-existent keys are handled gracefully
await removeAsync('neverStored'); // Success, no error
```

---

## How It Works

### Chunking Strategy

1. Data is serialized to JSON using `JSON.stringify()`
2. The serialized string is split into chunks of 1,000,000 characters
3. Each chunk is stored with a numeric suffix: `key0`, `key1`, `key2`, etc.
4. The total number of chunks is stored under the original key

### Example Flow

```
storeAsync('myData', largeObject)
  ↓
JSON.stringify(largeObject) → '{"items":[...]}' (2.5M chars)
  ↓
Split into chunks:
  - myData0: 1,000,000 chars
  - myData1: 1,000,000 chars
  - myData2: 500,000 chars
  ↓
Store chunk count:
  - myData: "3"
```

### Storage Layout

```
AsyncStorage Keys:
┌─────────────────────────────────────┐
│ myData    → "3" (chunk count)       │
│ myData0   → chunk 1 (1MB)           │
│ myData1   → chunk 2 (1MB)           │
│ myData2   → chunk 3 (remaining)     │
└─────────────────────────────────────┘
```

## Error Handling

All functions provide detailed error messages to help diagnose issues:

```typescript
try {
  await getAsync('corrupted');
} catch (error) {
  // Error: Storage corruption: chunk 2 of 5 missing for key "corrupted"
  console.error(error.message);
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Storage key cannot be empty` | Empty or whitespace key | Provide a valid key |
| `No data found for key "x"` | Key doesn't exist | Check if data was stored |
| `Invalid chunk count for key "x"` | Corrupted metadata | Remove and re-store data |
| `Storage corruption: chunk N of M missing` | Partial data loss | Remove and re-store data |
| `Failed to parse data for key "x"` | Invalid JSON | Check data integrity |

## Best Practices

### 1. Use Type Guards

```typescript
interface UserProfile {
  id: string;
  name: string;
  email?: string;
}

const user = await getAsync<UserProfile>('user');
if (user?.email) {
  sendEmail(user.email);
}
```

### 2. Handle Errors Gracefully

```typescript
async function loadConfig() {
  try {
    const config = await getAsync<Config>('config');
    return config ?? defaultConfig;
  } catch (error) {
    console.warn('Failed to load config, using defaults');
    return defaultConfig;
  }
}
```

### 3. Clean Up Unused Data

```typescript
// Remove old data when no longer needed
await removeAsync('tempCache');
```

### 4. Avoid Very Large Keys

Short keys are more efficient:
```typescript
// Good
await storeAsync('usr', userData);

// Avoid
await storeAsync('veryLongKeyNameThatWastesMemory', userData);
```

## Limitations

- **Chunk Size**: Fixed at 1MB per chunk for compatibility across platforms
- **Synchronous Operations**: Each operation is atomic; concurrent writes to the same key may conflict
- **Memory Usage**: Retrieving very large data loads everything into memory

## Platform Support

| Platform | Total Storage | Per-Entry Limit | Chunk Size | Notes |
|----------|---------------|-----------------|------------|-------|
| **iOS** | ~6MB default | ~6MB | 1MB | Safe within default limits |
| **Android** | ~6MB default (configurable) | ~2MB (WindowCursor SQLite) | 1MB | ✅ **Below Android's 2MB per-entry limit** |

### Why 1MB Chunk Size?

The 1MB chunk size is specifically designed to work within Android's **WindowCursor SQLite limit** of approximately 2MB per entry:

> *"Per-entry is limited by a size of a WindowCursor, a buffer used to read data from SQLite. Currently it's size is around 2 MB."* — AsyncStorage Documentation

By using 1MB chunks, this library:
- ✅ Stays safely below Android's 2MB per-entry limit
- ✅ Allows storing data larger than the 6MB total limit through chunking
- ✅ Works across iOS and Android without platform-specific code

## License

MIT