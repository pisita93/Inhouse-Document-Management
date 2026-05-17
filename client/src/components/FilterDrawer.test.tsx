import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDrawer } from './FilterDrawer.js';

describe('FilterDrawer', () => {
  it('is closed by default and shows only the trigger', () => {
    render(
      <FilterDrawer>
        <div>panel content</div>
      </FilterDrawer>,
    );
    expect(screen.getByLabelText('Open filters')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the dialog when the trigger is clicked', () => {
    render(
      <FilterDrawer>
        <div>panel content</div>
      </FilterDrawer>,
    );
    fireEvent.click(screen.getByLabelText('Open filters'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('panel content')).toBeTruthy();
  });

  it('closes when the backdrop is clicked', () => {
    render(
      <FilterDrawer>
        <div>panel content</div>
      </FilterDrawer>,
    );
    fireEvent.click(screen.getByLabelText('Open filters'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the close button is clicked', () => {
    render(
      <FilterDrawer>
        <div>panel content</div>
      </FilterDrawer>,
    );
    fireEvent.click(screen.getByLabelText('Open filters'));
    fireEvent.click(screen.getByLabelText('Close filters'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open when the panel interior is clicked', () => {
    render(
      <FilterDrawer>
        <div>panel content</div>
      </FilterDrawer>,
    );
    fireEvent.click(screen.getByLabelText('Open filters'));
    fireEvent.click(screen.getByText('panel content'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
