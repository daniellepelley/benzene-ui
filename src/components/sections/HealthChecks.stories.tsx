import type { Meta, StoryObj } from '@storybook/react';
import { HealthChecks } from './HealthChecks';
import type { ServiceSnapshot } from '../../contracts';

const snap = (over: Partial<ServiceSnapshot>): ServiceSnapshot =>
  ({ name: 'orders-api', fetchedAtUtc: '2026-07-16T09:15:00Z', specJson: null, specHash: null, previousSpecHash: null, contractDrift: false, health: null, error: null, ...over }) as ServiceSnapshot;

const meta = { title: 'Sections/HealthChecks', component: HealthChecks, args: { snapshot: null } } satisfies Meta<typeof HealthChecks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotFetched: Story = {};
export const AllPassing: Story = { args: { snapshot: snap({ health: { status: 'healthy', checks: [{ name: 'database', healthy: true }, { name: 'sqs', healthy: true }] } as never }) } };
export const OneFailing: Story = { args: { snapshot: snap({ health: { status: 'degraded', checks: [{ name: 'database', healthy: true }, { name: 'sqs', healthy: false, message: 'Queue not reachable' }] } as never }) } };
export const Unreachable: Story = { args: { snapshot: snap({ error: 'HttpRequestException: Connection refused' }) } };
export const NoChecksPublished: Story = { args: { snapshot: snap({ health: { status: 'healthy', checks: [] } as never }) } };
