import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectVisibleServices, ragForStatus } from '../../store/selectors';
import { serviceToggled, navigated } from '../../store/slices/viewSlice';
import { ServiceCard } from '../controls/ServiceCard';
import { EmptyState } from '../primitives/EmptyState';

/**
 * The one place components meet the store.
 *
 * Containers read with selectors and write with dispatch; everything below them is a pure component
 * taking props. Keeping that boundary in a handful of containers is what makes the rest of the
 * library reusable — a team assembling their own mesh UI takes the components and supplies their own
 * containers, or reuses ours.
 */
export function ServiceList() {
  const services = useAppSelector(selectVisibleServices);
  const expanded = useAppSelector((s) => s.view.expandedServices);
  const dispatch = useAppDispatch();

  if (services.length === 0) {
    return <EmptyState message="No services match this filter." />;
  }

  return (
    <div className="bz-svc-list">
      {services.map((service) => (
        <ServiceCard
          key={service.name}
          service={service}
          rag={ragForStatus(service.status)}
          expanded={expanded.includes(service.name)}
          onToggle={(name) => dispatch(serviceToggled(name))}
          onOpen={(name) => dispatch(navigated({ page: 'service', selected: name }))}
        />
      ))}
    </div>
  );
}
