import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import { api } from '../../lib/api';
import type { Variant } from '../../ui/feedback/catalog';

export type StyleMap = Record<string, Variant>;

/**
 * The global element styles, read the same way `ElementStyleProvider` reads them.
 *
 * SAME QUERY KEY, deliberately. The provider caches `['element-styles']` with a five-minute
 * staleTime and nothing has ever invalidated it — so before this hook existed, an admin could change
 * a variant, watch the request succeed, and sit looking at the old one for up to five minutes on the
 * very screen whose job is to show the change. "Applies globally with no redeploy" was true of every
 * client except the one making the decision.
 *
 * Sharing the key means the mutation below refreshes the provider, the studio and the preview in one
 * act, because they are all the same cache entry.
 */
export function useElementStyles() {
  return useQuery({
    queryKey: ['element-styles'],
    queryFn: () => api<{ styles: StyleMap }>('/ui/element-styles'),
  });
}

/**
 * Switch one element's global variant.
 *
 * The endpoint is admin-only, re-checks the role against the DATABASE at execution time, and writes
 * an audit row in the same transaction as the change. None of that is this hook's business — what is
 * its business is that the acting admin sees the result.
 *
 * `onSettled` rather than `onSuccess`: a failed switch also needs the refetch, because the most
 * likely failures are a role revoked underneath the tab and a row somebody else just changed. In
 * both cases the screen is now wrong, and leaving it showing the click rather than the truth is how
 * an admin ends up making the same change twice.
 */
export function useSetElementVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ elementId, variant }: { elementId: string; variant: Variant }) =>
      apiWithRefresh<{ ok: true }>(`/ui/element-styles/${encodeURIComponent(elementId)}`, {
        method: 'PUT',
        body: { variant },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['element-styles'] }),
  });
}
