import { ClassType, DataType, UuidInfo } from './models';

export class BlameTemplateRenderer {
  static render(template: string[], info: UuidInfo): string {
    return template.map(item => this.renderItem(item, info)).join('');
  }

  private static renderItem(item: string, info: UuidInfo): string {
    switch (item) {
      case 'type': return `**Type:** \`${info.type}\`\n\n`;
      case 'className': return info.className ? `**Class:** \`${info.className}\`\n\n` : '';
      case 'propertyName': return info.propertyName ? `**Property:** \`${info.propertyName}\`\n\n` : '';
      case 'uuid': return `**UUID:** \`${info.uuid}\`\n\n`;
      case 'description': return info.description ? `**Description:** \`${info.description}\`\n\n` : '';
      case 'goToButton': return `[Go to Definition](command:uuid-navigator.goToDefinition?${encodeURIComponent(JSON.stringify(info.uuid))})\n\n`;
      case 'classUuid': return info.classUuid ? `**Class UUID:** \`${info.classUuid}\`\n\n` : '';
      case 'dataType': return info.dataType !== undefined ? `**Data type:** \`${DataType[info.dataType]}\`\n\n` : '';
      case 'classType': return info.classType !== undefined ? `**Class type:** \`${ClassType[info.classType]}\`\n\n` : '';
      default: return '';
    }
  }
}