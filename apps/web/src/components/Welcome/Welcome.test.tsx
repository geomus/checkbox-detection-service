import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import Welcome from './index'

describe('Welcome Component', () => {
  it('renders correctly', () => {
    render(<Welcome />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('HomeVision')

    const subheading = screen.getByRole('heading', { level: 2 })
    expect(subheading).toHaveTextContent('Challenge Template')

    const tags = within(screen.getByTestId('tags')).getAllByRole('listitem')
    expect(tags.length).toBe(7)
  })
})
