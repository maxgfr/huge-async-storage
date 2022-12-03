import * as React from 'react';
import {StyleSheet, View} from 'react-native';

export type SimpleModalProps = {
  isVisible: boolean;
  children: React.ReactNode;
};

export const SimpleModal = (props: SimpleModalProps) => {
  return (
    <>
      {props.isVisible && (
        <View style={styles.container}>{props.children}</View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
