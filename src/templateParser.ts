import { DataType, UuidBlameInfo } from './types';

export class BlameTemplateParser {
  static parse(template: string[], blameInfo: UuidBlameInfo): string {
    let result = '';

    for (const item of template) {
      switch (item) {
        case 'type':
          result += `**Type:** \`${blameInfo.type}\`\n\n`;
          break;

        case 'className':
          if (blameInfo.className) {
            result += `**Class:** \`${blameInfo.className}\`\n\n`;
          }
          break;

        case 'propertyName':
          if (blameInfo.propertyName) {
            result += `**Property:** \`${blameInfo.propertyName}\`\n\n`;
          }
          break;

        case 'uuid':
          result += `**UUID:** \`${blameInfo.uuid}\`\n\n`;
          break;

        case 'description':
          if (blameInfo.description) {
            result += `**Description:** \`${blameInfo.description}\`\n\n`;
          }
          break;

        case 'goToButton':
          result += `[Go to Definition](command:uuid-navigator.goToDefinition?${encodeURIComponent(JSON.stringify(blameInfo.uuid))})\n\n`;
          break;

        case 'classUuid':
          if (blameInfo.classUuid) {
            result += `**Class UUID:** \`${blameInfo.classUuid}\`\n\n`;
          }
          break;

        case 'dataType':
          if(blameInfo.dataType !== undefined){
            result += `**Data type:** \`${DataType[blameInfo.dataType]}\`\n\n`
          }
          break;
      }
    }

    return result;
  }
}