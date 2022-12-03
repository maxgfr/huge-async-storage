import * as React from 'react';
import {Text} from 'react-native';
import {render} from '@testing-library/react-native';
import {SimpleModal} from '../SimpleModal';

describe('SimpleModal', () => {
  it('renders correctly', () => {
    const component = render(
      <SimpleModal isVisible={true}>
        <Text testID="text">Bonjour</Text>
      </SimpleModal>,
    );
    expect(component).toBeTruthy();
  });

  it('get value', () => {
    const component = render(
      <SimpleModal isVisible={true}>
        <Text testID="text">Bonjour</Text>
      </SimpleModal>,
    );
    const text = component.getByTestId('text');
    expect(text.props.children).toBe('Bonjour');
  });
});
