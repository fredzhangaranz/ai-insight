import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { AIConfiguration } from "@/lib/services/ai-config.service";

interface ProviderCardProps {
  config: AIConfiguration;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onSetDefault?: () => void;
  onValidate?: () => void;
  isValidating?: boolean;
  showActions?: boolean;
}

export function ProviderCard({
  config,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetDefault,
  onValidate,
  isValidating = false,
  showActions = true,
}: ProviderCardProps) {
  const getValidationBadge = (config: AIConfiguration) => {
    if (config.validationStatus === "valid") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircleIcon className="w-3 h-3 mr-1" />
          Valid
        </Badge>
      );
    } else if (config.validationStatus === "invalid") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <XCircleIcon className="w-3 h-3 mr-1" />
          Invalid
        </Badge>
      );
    } else if (config.validationStatus === "error") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }
  };

  const getProviderIcon = (providerType: string) => {
    switch (providerType) {
      case "anthropic":
        return "🤖";
      case "google":
        return "🌐";
      case "openwebui":
        return "🏠";
      default:
        return "⚙️";
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex items-center space-x-4">
        <div className="text-2xl">{getProviderIcon(config.providerType)}</div>
        <div>
          <h3 className="font-medium text-slate-900">{config.providerName}</h3>
          <p className="text-sm text-slate-600">
            {config.providerType.charAt(0).toUpperCase() +
              config.providerType.slice(1)}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          {config.isDefault && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              <StarIcon className="w-3 h-3 mr-1" />
              Default
            </Badge>
          )}
          {getValidationBadge(config)}
        </div>

        {showActions && (
          <>
            <div className="flex items-center space-x-2">
              <Switch
                checked={config.isEnabled}
                onCheckedChange={onToggleEnabled}
                disabled={!!onToggleEnabled}
              />
              <span className="text-sm text-slate-600">
                {config.isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {!config.isDefault && config.isEnabled && onSetDefault && (
                <Button variant="outline" size="sm" onClick={onSetDefault}>
                  Set Default
                </Button>
              )}

              {onValidate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onValidate}
                  disabled={isValidating}
                >
                  {isValidating ? "Testing..." : "Test"}
                </Button>
              )}

              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <PencilIcon className="w-4 h-4" />
                </Button>
              )}

              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
