# huge-async-storage

A wrapper of AsyncStorage that allows you to store huge data on [react-native](https://reactnative.dev/).

## Installation

```sh
yarn add huge-async-storage
```

## Usage

```tsx
import {storeAsync, getAsync, removeAsync} from "huge-async-storage";

.....

await storeAsync(`value1`, {value: Array(1000000).fill(1)}); // store huge data
const value1 = await getAsync(`value1`); // to get the value by key
await removeAsync(`value1`); // to remove the value
```
