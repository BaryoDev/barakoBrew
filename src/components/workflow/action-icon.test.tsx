import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IconBolt, IconWebhook } from '@/components/icons';
import { ActionIcon } from './action-icon';

function markup(node: React.ReactElement) {
  return render(node).container.innerHTML;
}

describe('ActionIcon', () => {
  it('draws the Request action with the connector icon, not the fallback', () => {
    const request = markup(<ActionIcon type="Request" />);
    expect(request).not.toBe('');
    expect(request).toBe(markup(<IconWebhook />));
    expect(request).not.toBe(markup(<IconBolt />));
  });

  it('still draws a kind the console has never heard of, with the fallback icon', () => {
    const unknown = markup(<ActionIcon type="SomeModuleAction" />);
    expect(unknown).not.toBe('');
    expect(unknown).toBe(markup(<IconBolt />));
  });
});
