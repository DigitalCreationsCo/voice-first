import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from '../app/old-page'
 
test('Page', async () => {
  render(await Page())
  expect(screen.getByRole('heading', { level: 1, name: 'NextAuth.js Example' })).toBeDefined()
})