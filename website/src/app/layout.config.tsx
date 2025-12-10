import { Icon } from '@iconify/react';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2 font-semibold">
          <Icon icon="lucide:wind" className="size-5" />
          <span>Gust</span>
        </div>
      ),
    },
    links: [
      {
        type: 'icon',
        icon: <Icon icon="lucide:github" className="size-5" />,
        text: 'GitHub',
        url: 'https://github.com/SylphxAI/gust',
        label: 'GitHub Repository',
      },
      {
        type: 'icon',
        icon: <Icon icon="lucide:package" className="size-5" />,
        text: 'npm',
        url: 'https://www.npmjs.com/package/@sylphx/gust',
        label: 'npm Package',
      },
    ],
    githubUrl: 'https://github.com/SylphxAI/gust',
  };
}
